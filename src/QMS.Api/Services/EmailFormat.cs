using System.Net.Mail;

namespace QMS.Api.Services;

public static class EmailFormat
{
    public static bool IsValid(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 256) return false;
        try
        {
            _ = new MailAddress(email);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
