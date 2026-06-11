using System.Security.Cryptography;

namespace QMS.Api.Services;

public static class OtpCode
{
    /// <summary>6-digit numeric code (may start with 0).</summary>
    public static string CreateSixDigits()
    {
        return RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }
}
