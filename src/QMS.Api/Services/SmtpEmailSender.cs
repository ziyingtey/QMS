using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace QMS.Api.Services;

public sealed class SmtpEmailSender(IOptions<SmtpOptions> smtpOptions, ILogger<SmtpEmailSender> log) : IEmailSender
{
    private readonly SmtpOptions _smtp = smtpOptions.Value;

    public async Task SendCustomerVerificationEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string verifyUrl,
        CancellationToken cancellationToken = default)
    {
        if (_smtp.DryRun)
        {
            log.LogWarning(
                "SMTP DryRun is ON — no email sent. Verification link for {ToEmail}: {VerifyUrl}",
                toEmail,
                verifyUrl);
            await Task.CompletedTask.ConfigureAwait(false);
            return;
        }

        if (string.IsNullOrWhiteSpace(_smtp.Host))
            throw new InvalidOperationException("Smtp:Host is not configured.");
        if (string.IsNullOrWhiteSpace(_smtp.FromEmail))
            throw new InvalidOperationException("Smtp:FromEmail is not configured.");

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        message.To.Add(new MailboxAddress(string.IsNullOrWhiteSpace(recipientDisplayName) ? toEmail : recipientDisplayName, toEmail));
        message.Subject = "Verify your QGo account";

        var body =
            "Welcome to QGo (Smart Queue Management).\r\n\r\n"
            + "Please verify your email by opening this link in your browser:\r\n"
            + verifyUrl
            + "\r\n\r\n"
            + "This link expires in 24 hours.\r\n\r\n"
            + "If you did not create an account, you can ignore this message.\r\n";

        message.Body = new TextPart("plain") { Text = body };

        using var client = new SmtpClient();
        var secure =
            _smtp.Port == 465 && !_smtp.UseStartTls
                ? SecureSocketOptions.SslOnConnect
                : _smtp.UseStartTls
                    ? SecureSocketOptions.StartTls
                    : SecureSocketOptions.Auto;

        log.LogInformation("SMTP connect {Host}:{Port} ({Secure})", _smtp.Host, _smtp.Port, secure);
        await client.ConnectAsync(_smtp.Host, _smtp.Port, secure, cancellationToken).ConfigureAwait(false);

        if (!string.IsNullOrWhiteSpace(_smtp.User))
            await client.AuthenticateAsync(_smtp.User, _smtp.Password ?? "", cancellationToken).ConfigureAwait(false);

        await client.SendAsync(message, cancellationToken).ConfigureAwait(false);
        await client.DisconnectAsync(true, cancellationToken).ConfigureAwait(false);
    }

    public async Task SendCustomerOtpEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string otpCode,
        int validMinutes,
        CancellationToken cancellationToken = default)
    {
        if (_smtp.DryRun)
        {
            log.LogWarning(
                "SMTP DryRun is ON — no email sent. OTP for {ToEmail}: {Otp} (valid {Minutes} min)",
                toEmail,
                otpCode,
                validMinutes);
            await Task.CompletedTask.ConfigureAwait(false);
            return;
        }

        if (string.IsNullOrWhiteSpace(_smtp.Host))
            throw new InvalidOperationException("Smtp:Host is not configured.");
        if (string.IsNullOrWhiteSpace(_smtp.FromEmail))
            throw new InvalidOperationException("Smtp:FromEmail is not configured.");

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        message.To.Add(new MailboxAddress(string.IsNullOrWhiteSpace(recipientDisplayName) ? toEmail : recipientDisplayName, toEmail));
        message.Subject = "Your QGo verification code";

        var body =
            "Welcome to QGo (Smart Queue Management).\r\n\r\n"
            + "Your verification code is:\r\n\r\n"
            + otpCode
            + "\r\n\r\n"
            + $"This code expires in {validMinutes} minutes.\r\n\r\n"
            + "Enter this code in the QGo app to verify your email.\r\n\r\n"
            + "If you did not create an account, you can ignore this message.\r\n";

        message.Body = new TextPart("plain") { Text = body };

        using var client = new SmtpClient();
        var secure =
            _smtp.Port == 465 && !_smtp.UseStartTls
                ? SecureSocketOptions.SslOnConnect
                : _smtp.UseStartTls
                    ? SecureSocketOptions.StartTls
                    : SecureSocketOptions.Auto;

        log.LogInformation("SMTP connect {Host}:{Port} ({Secure})", _smtp.Host, _smtp.Port, secure);
        await client.ConnectAsync(_smtp.Host, _smtp.Port, secure, cancellationToken).ConfigureAwait(false);

        if (!string.IsNullOrWhiteSpace(_smtp.User))
            await client.AuthenticateAsync(_smtp.User, _smtp.Password ?? "", cancellationToken).ConfigureAwait(false);

        await client.SendAsync(message, cancellationToken).ConfigureAwait(false);
        await client.DisconnectAsync(true, cancellationToken).ConfigureAwait(false);
    }

    public async Task SendCustomerPasswordResetEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string resetUrl,
        int validMinutes,
        CancellationToken cancellationToken = default)
    {
        if (_smtp.DryRun)
        {
            log.LogWarning(
                "SMTP DryRun is ON — no email sent. Password reset link for {ToEmail}: {ResetUrl} (valid {Minutes} min)",
                toEmail,
                resetUrl,
                validMinutes);
            await Task.CompletedTask.ConfigureAwait(false);
            return;
        }

        if (string.IsNullOrWhiteSpace(_smtp.Host))
            throw new InvalidOperationException("Smtp:Host is not configured.");
        if (string.IsNullOrWhiteSpace(_smtp.FromEmail))
            throw new InvalidOperationException("Smtp:FromEmail is not configured.");

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        message.To.Add(new MailboxAddress(string.IsNullOrWhiteSpace(recipientDisplayName) ? toEmail : recipientDisplayName, toEmail));
        message.Subject = "Reset your QGo password";

        var body =
            "You asked to reset your QGo (Smart Queue Management) password.\r\n\r\n"
            + "Open this link in your browser (expires in "
            + validMinutes
            + " minutes):\r\n"
            + resetUrl
            + "\r\n\r\n"
            + "Or open the QGo app → Forgot password → paste the token from the end of that link into \"Reset token\".\r\n\r\n"
            + "If you did not request this, you can ignore this email.\r\n";

        message.Body = new TextPart("plain") { Text = body };

        using var client = new SmtpClient();
        var secure =
            _smtp.Port == 465 && !_smtp.UseStartTls
                ? SecureSocketOptions.SslOnConnect
                : _smtp.UseStartTls
                    ? SecureSocketOptions.StartTls
                    : SecureSocketOptions.Auto;

        log.LogInformation("SMTP connect {Host}:{Port} ({Secure})", _smtp.Host, _smtp.Port, secure);
        await client.ConnectAsync(_smtp.Host, _smtp.Port, secure, cancellationToken).ConfigureAwait(false);

        if (!string.IsNullOrWhiteSpace(_smtp.User))
            await client.AuthenticateAsync(_smtp.User, _smtp.Password ?? "", cancellationToken).ConfigureAwait(false);

        await client.SendAsync(message, cancellationToken).ConfigureAwait(false);
        await client.DisconnectAsync(true, cancellationToken).ConfigureAwait(false);
    }

    public async Task SendPasswordResetOtpEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string otpCode,
        int validMinutes,
        CancellationToken cancellationToken = default)
    {
        if (_smtp.DryRun)
        {
            log.LogWarning(
                "SMTP DryRun is ON — no email sent. Password reset OTP for {ToEmail}: {Otp} (valid {Minutes} min)",
                toEmail,
                otpCode,
                validMinutes);
            await Task.CompletedTask.ConfigureAwait(false);
            return;
        }

        if (string.IsNullOrWhiteSpace(_smtp.Host))
            throw new InvalidOperationException("Smtp:Host is not configured.");
        if (string.IsNullOrWhiteSpace(_smtp.FromEmail))
            throw new InvalidOperationException("Smtp:FromEmail is not configured.");

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        message.To.Add(new MailboxAddress(string.IsNullOrWhiteSpace(recipientDisplayName) ? toEmail : recipientDisplayName, toEmail));
        message.Subject = "Your QGo password reset code";

        var body =
            "You asked to reset your QGo (Smart Queue Management) password.\r\n\r\n"
            + "Your reset code is:\r\n\r\n"
            + otpCode
            + "\r\n\r\n"
            + $"This code expires in {validMinutes} minutes.\r\n\r\n"
            + "Enter this code in the QGo app (Forgot password), then choose a new password.\r\n\r\n"
            + "If you did not request this, you can ignore this email.\r\n";

        message.Body = new TextPart("plain") { Text = body };

        using var client = new SmtpClient();
        var secure =
            _smtp.Port == 465 && !_smtp.UseStartTls
                ? SecureSocketOptions.SslOnConnect
                : _smtp.UseStartTls
                    ? SecureSocketOptions.StartTls
                    : SecureSocketOptions.Auto;

        log.LogInformation("SMTP connect {Host}:{Port} ({Secure})", _smtp.Host, _smtp.Port, secure);
        await client.ConnectAsync(_smtp.Host, _smtp.Port, secure, cancellationToken).ConfigureAwait(false);

        if (!string.IsNullOrWhiteSpace(_smtp.User))
            await client.AuthenticateAsync(_smtp.User, _smtp.Password ?? "", cancellationToken).ConfigureAwait(false);

        await client.SendAsync(message, cancellationToken).ConfigureAwait(false);
        await client.DisconnectAsync(true, cancellationToken).ConfigureAwait(false);
    }
}
