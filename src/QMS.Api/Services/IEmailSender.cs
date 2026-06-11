namespace QMS.Api.Services;

public interface IEmailSender
{
    Task SendCustomerVerificationEmailAsync(
        string toEmail,
        string recipientDisplayName,
        string verifyUrl,
        CancellationToken cancellationToken = default);
}
