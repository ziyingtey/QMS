namespace QMS.Domain.Entities;

/// <summary>Persisted refresh token session (opaque bearer rotated on each refresh).</summary>
public sealed class RefreshSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>SHA-256 hex (64 chars) of the plaintext refresh token.</summary>
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}
