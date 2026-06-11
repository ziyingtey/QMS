namespace QMS.Api;

internal static class PasswordPolicy
{
    /// <summary>
    /// Customer password: min 6 chars, uppercase, lowercase, digit, and at least one symbol (non-letter/digit, not whitespace).
    /// </summary>
    public static bool IsValid(string password, out string message)
    {
        if (string.IsNullOrWhiteSpace(password))
        {
            message = "Password is required.";
            return false;
        }

        if (password.Length < 6)
        {
            message = "Password must be at least 6 characters.";
            return false;
        }

        if (!password.Any(char.IsUpper))
        {
            message = "Password must include at least one uppercase letter (A–Z).";
            return false;
        }

        if (!password.Any(char.IsLower))
        {
            message = "Password must include at least one lowercase letter (a–z).";
            return false;
        }

        if (!password.Any(char.IsDigit))
        {
            message = "Password must include at least one number (0–9).";
            return false;
        }

        if (!password.Any(c => !char.IsLetterOrDigit(c) && !char.IsWhiteSpace(c)))
        {
            message = "Password must include at least one symbol (e.g. @, #, $, %).";
            return false;
        }

        message = "";
        return true;
    }
}
