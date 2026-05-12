using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AuthController(QmsDbContext db, IPasswordHasher<string> passwordHasher, JwtTokenService jwt) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });
        if (request.Password.Length < 6)
            return BadRequest(new { message = "Password must be at least 6 characters." });

        var email = request.Email.Trim();
        if (await db.Customers.AnyAsync(u => u.Email == email, cancellationToken)
            || await db.StaffMembers.AnyAsync(s => s.Email == email, cancellationToken))
            return Conflict(new { message = "An account with this email already exists." });

        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            Email = email,
            Name = string.IsNullOrWhiteSpace(request.Name) ? email.Split('@')[0] : request.Name.Trim(),
            PasswordHash = passwordHasher.HashPassword(email, request.Password)
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync(cancellationToken);

        const string role = "Customer";
        var token = jwt.CreateToken(customer.Id, customer.Email, role);
        return Ok(new LoginResponse(token, customer.Id, customer.Email, role));
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email, cancellationToken);
        if (customer is not null)
        {
            var ok = passwordHasher.VerifyHashedPassword(email, customer.PasswordHash, request.Password);
            if (ok == PasswordVerificationResult.Failed) return Unauthorized();
            const string role = "Customer";
            var token = jwt.CreateToken(customer.Id, customer.Email, role);
            return Ok(new LoginResponse(token, customer.Id, customer.Email, role));
        }

        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(s => s.Email == email, cancellationToken);
        if (staff is null) return Unauthorized();

        var staffOk = passwordHasher.VerifyHashedPassword(email, staff.PasswordHash, request.Password);
        if (staffOk == PasswordVerificationResult.Failed) return Unauthorized();

        var staffRole = staff.Role.ToString();
        var staffToken = jwt.CreateToken(staff.Id, staff.Email, staffRole);
        return Ok(new LoginResponse(staffToken, staff.Id, staff.Email, staffRole));
    }
}

public sealed record RegisterRequest(string Email, string Password, string? Name);
public sealed record LoginRequest(string Email, string Password);
public sealed record LoginResponse(string Token, Guid UserId, string Email, string Role);
