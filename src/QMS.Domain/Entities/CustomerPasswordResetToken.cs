namespace QMS.Domain.Entities;

/// <summary>One-time customer password reset; plain token is emailed, <see cref="TokenHash"/> is SHA-256 hex.</summary>
public class CustomerPasswordResetToken
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
