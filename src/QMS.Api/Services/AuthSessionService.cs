using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using QMS.Api;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

public sealed class AuthSessionService(QmsDbContext db, JwtTokenService jwt, IConfiguration configuration)
{
    private static string HashRefresh(string plain) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plain)));

    private static string NewRefreshPlain() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public async Task<LoginResponse> CreateSessionAsync(
        Guid userId,
        string email,
        string role,
        Guid? branchId,
        CancellationToken cancellationToken)
    {
        var accessToken = jwt.CreateAccessToken(userId, email, role);
        var plainRefresh = NewRefreshPlain();
        var days = configuration.GetValue("Jwt:RefreshTokenDays", 30);
        db.RefreshSessions.Add(new RefreshSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = HashRefresh(plainRefresh),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(days),
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(cancellationToken);
        return new LoginResponse(accessToken, plainRefresh, userId, email, role, branchId);
    }

    public async Task<LoginResponse?> RotateRefreshAsync(string plainRefresh, CancellationToken cancellationToken)
    {
        var hash = HashRefresh(plainRefresh);
        var session = await db.RefreshSessions.FirstOrDefaultAsync(
            s => s.TokenHash == hash && s.RevokedAt == null && s.ExpiresAt > DateTimeOffset.UtcNow,
            cancellationToken);
        if (session is null) return null;

        session.RevokedAt = DateTimeOffset.UtcNow;

        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == session.UserId, cancellationToken);
        Guid userId;
        string email;
        string role;
        Guid? branchId = null;

        if (customer is not null)
        {
            userId = customer.Id;
            email = customer.Email;
            role = "Customer";
        }
        else
        {
            var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == session.UserId, cancellationToken);
            if (staff is null)
            {
                await db.SaveChangesAsync(cancellationToken);
                return null;
            }

            userId = staff.Id;
            email = staff.Email;
            role = staff.Role.ToString();
            branchId = staff.BranchId;
        }

        var accessToken = jwt.CreateAccessToken(userId, email, role);
        var newPlain = NewRefreshPlain();
        var days = configuration.GetValue("Jwt:RefreshTokenDays", 30);
        db.RefreshSessions.Add(new RefreshSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = HashRefresh(newPlain),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(days),
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(cancellationToken);
        return new LoginResponse(accessToken, newPlain, userId, email, role, branchId);
    }

    public async Task<bool> TryRevokeAsync(string plainRefresh, CancellationToken cancellationToken)
    {
        var hash = HashRefresh(plainRefresh);
        var session = await db.RefreshSessions.FirstOrDefaultAsync(
            s => s.TokenHash == hash && s.RevokedAt == null,
            cancellationToken);
        if (session is null) return false;
        session.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
