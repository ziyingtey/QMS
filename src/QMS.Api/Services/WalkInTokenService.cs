using System.Security.Cryptography;
using System.Text;

namespace QMS.Api.Services;

public sealed class WalkInOptions
{
    public const string SectionName = "WalkIn";
    /// <summary>HMAC secret for daily branch QR tokens. Must be set in config (dev default only in appsettings.Development.json).</summary>
    public string TokenSecret { get; set; } = "";
    /// <summary>After branch-local midnight, yesterday's token stays valid for this many minutes.</summary>
    public int GraceMinutesAfterMidnight { get; set; } = 30;
    /// <summary>Public origin of staff-web, used to build the QR URL (e.g. https://qms.example.com). Falls back to request origin.</summary>
    public string PublicWebBaseUrl { get; set; } = "";
}

/// <summary>Daily rotating walk-in token: HMAC-SHA256(secret, "{branchId:N}|{yyyy-MM-dd branch-local}") → 8 chars base32.</summary>
public sealed class WalkInTokenService(Microsoft.Extensions.Options.IOptions<WalkInOptions> options)
{
    const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I

    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Value.TokenSecret);

    public string Compute(Guid branchId, DateOnly branchLocalDate)
    {
        var secret = options.Value.TokenSecret;
        if (string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException("WalkIn:TokenSecret is not configured.");
        using var h = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var mac = h.ComputeHash(Encoding.UTF8.GetBytes($"{branchId:N}|{branchLocalDate:yyyy-MM-dd}"));
        var sb = new StringBuilder(8);
        for (var i = 0; i < 8; i++) sb.Append(Alphabet[mac[i] & 31]);
        return sb.ToString();
    }

    public static DateOnly LocalDate(int zoneOffsetMinutes, DateTimeOffset nowUtc) =>
        DateOnly.FromDateTime(nowUtc.ToOffset(TimeSpan.FromMinutes(zoneOffsetMinutes)).DateTime);

    public bool Validate(Guid branchId, int zoneOffsetMinutes, string? token, DateTimeOffset nowUtc)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(token)) return false;
        var t = token.Trim().ToUpperInvariant();
        var local = nowUtc.ToOffset(TimeSpan.FromMinutes(zoneOffsetMinutes));
        var today = DateOnly.FromDateTime(local.DateTime);
        if (FixedEquals(t, Compute(branchId, today))) return true;
        if (local.TimeOfDay < TimeSpan.FromMinutes(Math.Max(0, options.Value.GraceMinutesAfterMidnight)))
            return FixedEquals(t, Compute(branchId, today.AddDays(-1)));
        return false;
    }

    static bool FixedEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
