namespace QMS.Api.Services;

public interface IEmailSender
{
    Task SendCustomerVerificationEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string verifyUrl,
        CancellationToken cancellationToken = default);

    Task SendCustomerOtpEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string otpCode,
        int validMinutes,
        CancellationToken cancellationToken = default);
}
