using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using QMS.Api;
using QMS.Api.Services;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;
using System.Net;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AuthController(
    QmsDbContext db,
    IPasswordHasher<string> passwordHasher,
    AuthSessionService sessions,
    IEmailSender emailSender,
    IOptions<PublicUrlOptions> publicUrls,
    ILogger<AuthController> log) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<RegisterPendingResponse>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });
        if (request.Password.Length < 6)
            return BadRequest(new { message = "Password must be at least 6 characters." });

        var email = request.Email.Trim();
        if (await db.Customers.AnyAsync(u => u.Email == email, cancellationToken)
            || await db.StaffMembers.AnyAsync(s => s.Email == email, cancellationToken))
            return Conflict(new { message = "An account with this email already exists." });

        var baseUrl = TryResolveApiPublicBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return BadRequest(new
            {
                message =
                    "Could not build the email verification link. Set PublicUrls:ApiPublicBaseUrl to your public API URL (HTTPS in production), or register from a client that reaches the API with a normal Host header (e.g. your PC's LAN IP, not an invalid host).",
            });
        }

        if (string.IsNullOrWhiteSpace(publicUrls.Value.ApiPublicBaseUrl?.Trim()))
            log.LogInformation("Using inferred API base URL for verification links: {BaseUrl}", baseUrl);

        var token = EmailVerificationToken.Create();
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            Email = email,
            Name = string.IsNullOrWhiteSpace(request.Name) ? email.Split('@')[0] : request.Name.Trim(),
            PasswordHash = passwordHasher.HashPassword(email, request.Password),
            EmailVerified = false,
            EmailVerificationToken = token,
            EmailVerificationTokenExpiresAt = DateTimeOffset.UtcNow.AddHours(24),
        };

        var verifyUrl = $"{baseUrl}/api/auth/verify-email?token={Uri.EscapeDataString(token)}";

        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            db.Customers.Add(customer);
            await db.SaveChangesAsync(cancellationToken);
            await emailSender.SendCustomerVerificationEmailAsync(customer.Email, customer.Name, verifyUrl, cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(cancellationToken);
            log.LogError(ex, "Registration failed for {Email} (email send or DB).", email);
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    message =
                        "Could not send the verification email. Check Smtp settings (host, port, credentials) and that the mailbox allows SMTP. No account was created.",
                });
        }

        return Ok(new RegisterPendingResponse(
            RequiresEmailVerification: true,
            Message: "We sent a verification link to your email. Open it to verify, then sign in here.",
            EmailSent: true));
    }

    /// <summary>Link target from the verification email (opens in the browser).</summary>
    [AllowAnonymous]
    [HttpGet("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromQuery] string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
            return Content(HtmlMessage("Invalid link", "Missing token. Use the link from your email."), "text/html; charset=utf-8");

        var customer = await db.Customers.FirstOrDefaultAsync(
            c => c.EmailVerificationToken == token,
            cancellationToken);

        if (customer is null)
            return Content(
                HtmlMessage("Link not valid", "This verification link is not valid or was already used."),
                "text/html; charset=utf-8");

        if (customer.EmailVerified)
        {
            return Content(
                HtmlMessage("Already verified", "You can return to the app and sign in."),
                "text/html; charset=utf-8");
        }

        if (customer.EmailVerificationTokenExpiresAt is null
            || customer.EmailVerificationTokenExpiresAt < DateTimeOffset.UtcNow)
        {
            return Content(
                HtmlMessage(
                    "Link expired",
                    "Request a new verification email from the app (Sign in screen → Resend verification)."),
                "text/html; charset=utf-8");
        }

        customer.EmailVerified = true;
        customer.EmailVerificationToken = null;
        customer.EmailVerificationTokenExpiresAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Content(
            HtmlMessage("Email verified", "You can return to the QGo app and sign in."),
            "text/html; charset=utf-8");
    }

    [AllowAnonymous]
    [HttpPost("resend-verification")]
    public async Task<ActionResult> ResendVerification([FromBody] ResendVerificationRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { message = "Email is required." });

        var email = request.Email.Trim();
        var baseUrl = TryResolveApiPublicBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
            return BadRequest(new { message = "Could not build the verification link. Set PublicUrls:ApiPublicBaseUrl." });

        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == email, cancellationToken);
        if (customer is null || customer.EmailVerified)
        {
            // Do not reveal whether the email exists.
            return Ok(new { message = "If that address has a pending account, we sent a new link." });
        }

        var newToken = EmailVerificationToken.Create();
        customer.EmailVerificationToken = newToken;
        customer.EmailVerificationTokenExpiresAt = DateTimeOffset.UtcNow.AddHours(24);
        await db.SaveChangesAsync(cancellationToken);

        var verifyUrl = $"{baseUrl}/api/auth/verify-email?token={Uri.EscapeDataString(newToken)}";
        try
        {
            await emailSender.SendCustomerVerificationEmailAsync(customer.Email, customer.Name, verifyUrl, cancellationToken);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Resend verification failed for {Email}.", email);
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new { message = "Could not send email. Check SMTP configuration on the server." });
        }

        return Ok(new { message = "If that address has a pending account, we sent a new link." });
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

            if (!customer.EmailVerified)
            {
                return BadRequest(new
                {
                    message = "Please verify your email first. Check your inbox for the link, or use Resend verification.",
                });
            }

            const string role = "Customer";
            return Ok(await sessions.CreateSessionAsync(customer.Id, customer.Email, role, null, cancellationToken));
        }

        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(s => s.Email == email, cancellationToken);
        if (staff is null) return Unauthorized();

        var staffOk = passwordHasher.VerifyHashedPassword(email, staff.PasswordHash, request.Password);
        if (staffOk == PasswordVerificationResult.Failed) return Unauthorized();

        var staffRole = staff.Role.ToString();
        return Ok(await sessions.CreateSessionAsync(staff.Id, staff.Email, staffRole, staff.BranchId, cancellationToken));
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<LoginResponse>> Refresh([FromBody] RefreshRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return BadRequest(new { message = "Refresh token is required." });

        var result = await sessions.RotateRefreshAsync(request.RefreshToken.Trim(), cancellationToken);
        if (result is null) return Unauthorized();
        return Ok(result);
    }

    /// <summary>Invalidate the given refresh session (e.g. sign-out on one device).</summary>
    [AllowAnonymous]
    [HttpPost("revoke")]
    public async Task<IActionResult> Revoke([FromBody] RefreshRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return BadRequest(new { message = "Refresh token is required." });

        await sessions.TryRevokeAsync(request.RefreshToken.Trim(), cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Prefer <see cref="PublicUrlOptions.ApiPublicBaseUrl"/>; if unset, infer <c>scheme://host</c> from this HTTP request
    /// (works for local dev when the app calls <c>http://192.168.x.x:5154</c>).
    /// </summary>
    private string? TryResolveApiPublicBaseUrl()
    {
        var configured = publicUrls.Value.ApiPublicBaseUrl?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(configured))
            return configured;

        var req = HttpContext.Request;
        var forwardedHost = FirstCsvValue(req.Headers["X-Forwarded-Host"].ToString());
        var host = !string.IsNullOrWhiteSpace(forwardedHost) ? forwardedHost : req.Host.Value;
        if (string.IsNullOrWhiteSpace(host))
            return null;

        var forwardedProto = FirstCsvValue(req.Headers["X-Forwarded-Proto"].ToString());
        var scheme = !string.IsNullOrWhiteSpace(forwardedProto) ? forwardedProto : req.Scheme;
        if (!string.Equals(scheme, "http", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(scheme, "https", StringComparison.OrdinalIgnoreCase))
            scheme = req.Scheme;

        return $"{scheme}://{host}".TrimEnd('/');
    }

    private static string? FirstCsvValue(string? header)
    {
        if (string.IsNullOrWhiteSpace(header)) return null;
        var comma = header.IndexOf(',');
        return (comma >= 0 ? header[..comma] : header).Trim();
    }

    private static string HtmlMessage(string title, string body)
    {
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeBody = WebUtility.HtmlEncode(body);
        return string.Concat(
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>",
            safeTitle,
            "</title><style>body{font-family:system-ui,sans-serif;padding:24px;max-width:40rem;line-height:1.5;color:#0f172a}</style></head><body><h1>",
            safeTitle,
            "</h1><p>",
            safeBody,
            "</p></body></html>");
    }
}
