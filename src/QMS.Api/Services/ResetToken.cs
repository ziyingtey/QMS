using System.Security.Cryptography;
using System.Text;

namespace QMS.Api.Services;

internal static class ResetToken
{
    /// <summary>URL-safe token and SHA-256 hex hash for storage.</summary>
    public static (string PlainToken, string TokenHash) Create()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        var b64 = Convert.ToBase64String(bytes).TrimEnd('=');
        var plain = b64.Replace('+', '-').Replace('/', '_');
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plain)));
        return (plain, hash);
    }

    public static string HashPlain(string plainToken)
    {
        var t = plainToken.Trim();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(t)));
    }
}
