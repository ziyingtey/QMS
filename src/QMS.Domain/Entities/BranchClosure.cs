namespace QMS.Domain.Entities;

/// <summary>
/// Ad-hoc branch closure (public holiday, renovation, etc.).
/// Bookings are blocked for slots overlapping any closure period.
/// </summary>
public class BranchClosure
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    /// <summary>Inclusive start of closure (date-only semantics, stored as midnight local).</summary>
    public DateTimeOffset ClosedFrom { get; set; }
    /// <summary>Inclusive end of closure.</summary>
    public DateTimeOffset ClosedTo { get; set; }
    /// <summary>Human-readable reason shown to customers.</summary>
    public string? Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
