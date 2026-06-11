using System.Security.Cryptography;

namespace QMS.Api.Services;

public static class EmailVerificationToken
{
    /// <summary>URL-safe token for query strings (no padding).</summary>
    public static string Create()
    {
        Span<byte> buf = stackalloc byte[32];
        RandomNumberGenerator.Fill(buf);
        return Convert.ToBase64String(buf)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
