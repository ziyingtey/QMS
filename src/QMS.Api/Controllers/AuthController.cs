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
using System.Linq;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AuthController(
    QmsDbContext db,
    IPasswordHasher<string> passwordHasher,
    AuthSessionService sessions,
    IEmailSender emailSender,
    IOptions<PublicUrlOptions> publicUrls,
    IOptions<SmtpOptions> smtpOptions,
    ILogger<AuthController> log) : ControllerBase
{
    private const int OtpValidMinutes = 5;
    private const int MaxOtpAttempts = 5;
    private const int ResendOtpCooldownSeconds = 30;

    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult<RegisterPendingResponse>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });
        if (!PasswordPolicy.IsValid(request.Password, out var pwdMsg))
            return BadRequest(new { message = pwdMsg });

        var email = request.Email.Trim();
        if (!EmailFormat.IsValid(email))
            return BadRequest(new { message = "Enter a valid email address." });

        string? phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        if (phone is not null)
        {
            if (phone.Length > 32)
                return BadRequest(new { message = "Phone number is too long." });

            var digitCount = phone.Count(char.IsDigit);
            if (digitCount < 8 || digitCount > 15 || !phone.All(c => char.IsDigit(c) || " +()-".Contains(c, StringComparison.Ordinal)))
                return BadRequest(new { message = "Enter a valid phone number, or leave the field empty." });
        }

        if (await db.Customers.AnyAsync(u => u.Email == email, cancellationToken)
            || await db.StaffMembers.AnyAsync(s => s.Email == email, cancellationToken))
            return Conflict(new { message = "An account with this email already exists." });

        var smtp = smtpOptions.Value;
        if (!smtp.DryRun)
        {
            if (string.IsNullOrWhiteSpace(smtp.Host))
            {
                return BadRequest(new
                {
                    message =
                        "Smtp:Host is not configured. Use e.g. smtp.gmail.com (see docs/real-email-verification-smtp.md). Optional: set Smtp:DryRun to true only if you intentionally want no mail (demo).",
                });
            }

            if (string.IsNullOrWhiteSpace(smtp.FromEmail))
                return BadRequest(new { message = "Smtp:FromEmail is not configured (for Gmail, use the same address as Smtp:User)." });

            if (string.IsNullOrWhiteSpace(smtp.User) || string.IsNullOrWhiteSpace(smtp.Password))
            {
                return BadRequest(new
                {
                    message =
                        "For real outbound email, set Smtp:User and Smtp:Password (Gmail: your address + 16-character app password, not your login password). See docs/real-email-verification-smtp.md.",
                });
            }
        }

        var otp = OtpCode.CreateSixDigits();
        var now = DateTimeOffset.UtcNow;
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            Email = email,
            Phone = phone,
            Name = string.IsNullOrWhiteSpace(request.Name) ? email.Split('@')[0] : request.Name.Trim(),
            PasswordHash = passwordHasher.HashPassword(email, request.Password),
            EmailVerified = false,
            EmailVerificationToken = null,
            EmailVerificationTokenExpiresAt = null,
            EmailOtpCode = otp,
            EmailOtpExpiresAt = now.AddMinutes(OtpValidMinutes),
            EmailOtpAttempts = 0,
            EmailOtpLastSentAt = now,
        };

        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            db.Customers.Add(customer);
            await db.SaveChangesAsync(cancellationToken);
            await emailSender.SendCustomerOtpEmailAsync(customer.Email, customer.Name, otp, OtpValidMinutes, cancellationToken);
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
                        "Could not send the verification code email. Check host, port, UseStartTls, user, password, and that your provider allows SMTP (Gmail needs an app password). No account was created. See docs/real-email-verification-smtp.md.",
                });
        }

        var dry = smtp.DryRun;
        var msg = dry
            ? "Account is ready. SMTP dry-run is on: no real email was sent. Check the API console for the 6-digit code, enter it below, then sign in."
            : $"We emailed a {OtpValidMinutes}-minute verification code. Enter it in the app, then sign in.";

        return Ok(new RegisterPendingResponse(
            RequiresEmailVerification: true,
            Message: msg,
            EmailSent: !dry,
            UsedDryRun: dry));
    }

    /// <summary>Customer enters the 6-digit code from email (primary flow).</summary>
    [AllowAnonymous]
    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp([FromBody] VerifyEmailOtpRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Otp))
            return BadRequest(new { message = "Email and verification code are required." });

        var email = request.Email.Trim();
        if (!EmailFormat.IsValid(email))
            return BadRequest(new { message = "Enter a valid email address." });

        var otpIn = request.Otp.Trim();
        if (otpIn.Length != 6 || !otpIn.All(char.IsDigit))
            return BadRequest(new { message = "Enter the 6-digit code from your email." });

        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == email, cancellationToken);
        if (customer is null || customer.EmailVerified)
            return BadRequest(new { message = "Invalid or expired code." });

        if (string.IsNullOrWhiteSpace(customer.EmailOtpCode))
            return BadRequest(new { message = "Invalid or expired code." });

        if (customer.EmailOtpExpiresAt is null || customer.EmailOtpExpiresAt < DateTimeOffset.UtcNow)
            return BadRequest(new { message = "This code has expired. Use Resend to get a new code." });

        if (customer.EmailOtpAttempts >= MaxOtpAttempts)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                new { message = "Too many incorrect attempts. Use Resend for a new code." });
        }

        if (!string.Equals(customer.EmailOtpCode, otpIn, StringComparison.Ordinal))
        {
            customer.EmailOtpAttempts++;
            await db.SaveChangesAsync(cancellationToken);
            return BadRequest(new { message = "Incorrect code. Check your email and try again." });
        }

        customer.EmailVerified = true;
        ClearCustomerOtp(customer);
        customer.EmailVerificationToken = null;
        customer.EmailVerificationTokenExpiresAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new { message = "Email verified. You can sign in." });
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
                HtmlVerificationInfo(
                    "Already verified",
                    "You can return to the QGo app and sign in with your email and password."),
                "text/html; charset=utf-8");
        }

        if (customer.EmailVerificationTokenExpiresAt is null
            || customer.EmailVerificationTokenExpiresAt < DateTimeOffset.UtcNow)
        {
            return Content(
                HtmlMessage(
                    "Link expired",
                    "Request a new code from the QGo app: open the email verification step (after registering) and use Resend code, or register again with the same email if your pending account was removed."),
                "text/html; charset=utf-8");
        }

        customer.EmailVerified = true;
        customer.EmailVerificationToken = null;
        customer.EmailVerificationTokenExpiresAt = null;
        ClearCustomerOtp(customer);
        await db.SaveChangesAsync(cancellationToken);

        return Content(
            HtmlVerificationSuccess(),
            "text/html; charset=utf-8");
    }

    [AllowAnonymous]
    [HttpPost("resend-verification")]
    public async Task<ActionResult> ResendVerification([FromBody] ResendVerificationRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { message = "Email is required." });

        var email = request.Email.Trim();
        if (!EmailFormat.IsValid(email))
            return BadRequest(new { message = "Enter a valid email address." });

        var smtp = smtpOptions.Value;
        if (!smtp.DryRun)
        {
            if (string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.FromEmail))
            {
                return BadRequest(new
                {
                    message = "SMTP is not fully configured (Host, FromEmail, User, Password). See docs/real-email-verification-smtp.md.",
                });
            }

            if (string.IsNullOrWhiteSpace(smtp.User) || string.IsNullOrWhiteSpace(smtp.Password))
            {
                return BadRequest(new
                {
                    message = "Smtp:User and Smtp:Password are required for resend when DryRun is false.",
                });
            }
        }

        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == email, cancellationToken);
        if (customer is null || customer.EmailVerified)
        {
            return Ok(new { message = "If that address has a pending account, we sent a new code." });
        }

        var now = DateTimeOffset.UtcNow;
        if (customer.EmailOtpLastSentAt is { } lastSent
            && now < lastSent.AddSeconds(ResendOtpCooldownSeconds))
        {
            var waitSec = (int)Math.Ceiling((lastSent.AddSeconds(ResendOtpCooldownSeconds) - now).TotalSeconds);
            return StatusCode(StatusCodes.Status429TooManyRequests, new { message = $"Please wait {waitSec} seconds before resending." });
        }

        var otp = OtpCode.CreateSixDigits();
        customer.EmailOtpCode = otp;
        customer.EmailOtpExpiresAt = now.AddMinutes(OtpValidMinutes);
        customer.EmailOtpAttempts = 0;
        customer.EmailOtpLastSentAt = now;
        customer.EmailVerificationToken = null;
        customer.EmailVerificationTokenExpiresAt = null;
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            await emailSender.SendCustomerOtpEmailAsync(customer.Email, customer.Name, otp, OtpValidMinutes, cancellationToken);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Resend verification failed for {Email}.", email);
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    message =
                        "Could not send email. Check SMTP settings, or use Smtp:DryRun for local testing (code is logged on the API).",
                });
        }

        return Ok(new { message = "If that address has a pending account, we sent a new code." });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        if (!EmailFormat.IsValid(email))
            return BadRequest(new { message = "Enter a valid email address." });

        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email, cancellationToken);
        if (customer is not null)
        {
            var ok = passwordHasher.VerifyHashedPassword(email, customer.PasswordHash, request.Password);
            if (ok == PasswordVerificationResult.Failed) return Unauthorized();

            if (!customer.EmailVerified)
            {
                return BadRequest(new
                {
                    message =
                        "Please verify your email before signing in. Use the verification screen in the app with the code we sent, or open the verification link from your email.",
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

    private const int PasswordResetValidMinutes = 15;

    /// <summary>Always returns the same message when the email is unknown (enumeration-safe). Sends mail only for verified customers.</summary>
    [AllowAnonymous]
    [HttpPost("forgot-password")]
    public async Task<ActionResult<object>> ForgotPassword([FromBody] ForgotPasswordRequest? request, CancellationToken cancellationToken)
    {
        const string publicMessage = "If an account exists for that email, we sent password reset instructions.";
        if (request is null || string.IsNullOrWhiteSpace(request.Email))
            return Ok(new { message = publicMessage });

        var email = request.Email.Trim();
        if (!EmailFormat.IsValid(email))
            return Ok(new { message = publicMessage });

        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == email && c.EmailVerified, cancellationToken);
        if (customer is null)
            return Ok(new { message = publicMessage });

        var smtp = smtpOptions.Value;
        if (!smtp.DryRun)
        {
            if (string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.FromEmail))
            {
                log.LogWarning("Forgot-password skipped for {Email}: SMTP Host/FromEmail not configured.", email);
                return Ok(new { message = publicMessage });
            }

            if (string.IsNullOrWhiteSpace(smtp.User) || string.IsNullOrWhiteSpace(smtp.Password))
            {
                log.LogWarning("Forgot-password skipped for {Email}: SMTP credentials not configured.", email);
                return Ok(new { message = publicMessage });
            }
        }

        var baseUrl = TryResolveApiPublicBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            log.LogWarning("Forgot-password skipped for {Email}: public API base URL unknown.", email);
            return Ok(new { message = publicMessage });
        }

        var (plain, tokenHash) = ResetToken.Create();
        var resetUrl = $"{baseUrl}/reset-password.html?t={Uri.EscapeDataString(plain)}";

        var now = DateTimeOffset.UtcNow;
        var stale = await db.CustomerPasswordResetTokens
            .Where(t => t.Email == email && t.UsedAt == null && t.ExpiresAt > now)
            .ToListAsync(cancellationToken);
        foreach (var s in stale)
            s.UsedAt = now;

        var row = new CustomerPasswordResetToken
        {
            Id = Guid.NewGuid(),
            Email = email,
            TokenHash = tokenHash,
            ExpiresAt = now.AddMinutes(PasswordResetValidMinutes),
            UsedAt = null,
            CreatedAt = now,
        };
        db.CustomerPasswordResetTokens.Add(row);

        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await emailSender.SendCustomerPasswordResetEmailAsync(
                customer.Email,
                customer.Name,
                resetUrl,
                PasswordResetValidMinutes,
                cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(cancellationToken);
            log.LogError(ex, "Forgot-password email failed for {Email}.", email);
            return Ok(new { message = publicMessage });
        }

        return Ok(new
        {
            message = publicMessage,
            usedDryRun = smtp.DryRun,
            resetUrl = smtp.DryRun ? resetUrl : null,
        });
    }

    [AllowAnonymous]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest? request, CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
            return BadRequest(new { message = "Token and new password are required." });

        if (!PasswordPolicy.IsValid(request.NewPassword, out var pwdMsg))
            return BadRequest(new { message = pwdMsg });

        var hash = ResetToken.HashPlain(request.Token);
        var row = await db.CustomerPasswordResetTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        if (row is null || row.UsedAt is not null || row.ExpiresAt < now)
            return BadRequest(new { message = "This reset link is invalid or has expired. Request a new reset from the app." });

        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == row.Email && c.EmailVerified, cancellationToken);
        if (customer is null)
            return BadRequest(new { message = "This reset link is invalid or has expired." });

        customer.PasswordHash = passwordHasher.HashPassword(row.Email, request.NewPassword);
        row.UsedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new { message = "Your password has been updated. You can sign in." });
    }

    private static void ClearCustomerOtp(Customer c)
    {
        c.EmailOtpCode = null;
        c.EmailOtpExpiresAt = null;
        c.EmailOtpAttempts = 0;
        c.EmailOtpLastSentAt = null;
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

    private static string HtmlVerificationSuccess()
    {
        const string title = "Email verified successfully";
        const string body = "Your account has been activated. Return to the QGo app and sign in with your email and password.";
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeBody = WebUtility.HtmlEncode(body);
        return string.Concat(
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>",
            safeTitle,
            "</title><style>",
            "body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:32px 20px;background:#f5f5f5;color:#1a1a1a}",
            ".card{max-width:28rem;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.08)}",
            ".ok{font-size:40px;text-align:center;margin-bottom:8px;line-height:1}",
            "h1{font-size:1.35rem;margin:0 0 12px;text-align:center;font-weight:700}",
            "p{line-height:1.55;margin:0;color:#475569;font-size:16px;text-align:center}",
            "</style></head><body><div class=\"card\"><div class=\"ok\">✅</div><h1>",
            safeTitle,
            "</h1><p>",
            safeBody,
            "</p></div></body></html>");
    }

    private static string HtmlVerificationInfo(string title, string body)
    {
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeBody = WebUtility.HtmlEncode(body);
        return string.Concat(
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>",
            safeTitle,
            "</title><style>",
            "body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:32px 20px;background:#f5f5f5;color:#1a1a1a}",
            ".card{max-width:28rem;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.08)}",
            "h1{font-size:1.2rem;margin:0 0 12px}",
            "p{line-height:1.55;margin:0;color:#475569;font-size:15px}",
            "</style></head><body><div class=\"card\"><h1>",
            safeTitle,
            "</h1><p>",
            safeBody,
            "</p></div></body></html>");
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
