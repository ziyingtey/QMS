namespace QMS.Domain.Entities;

/// <summary>Mobile / web banking customers only. Staff and managers use <see cref="Staff"/>.</summary>
public class Customer
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    /// <summary>After registration, false until the user verifies email (OTP or legacy link).</summary>
    public bool EmailVerified { get; set; }
    /// <summary>Legacy email-link verification (optional if using OTP only).</summary>
    public string? EmailVerificationToken { get; set; }
    public DateTimeOffset? EmailVerificationTokenExpiresAt { get; set; }
    /// <summary>6-digit OTP sent by email; cleared after successful verify or new resend.</summary>
    public string? EmailOtpCode { get; set; }
    public DateTimeOffset? EmailOtpExpiresAt { get; set; }
    public int EmailOtpAttempts { get; set; }
    /// <summary>Used for resend cooldown.</summary>
    public DateTimeOffset? EmailOtpLastSentAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<CustomerFavoriteBranch> FavoriteBranches { get; set; } = new List<CustomerFavoriteBranch>();
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
}
