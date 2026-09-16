namespace QMS.Domain.Entities;

/// <summary>Maps a counter to one allowed service lane. Counters must have at least one row to serve customers.</summary>
public class CounterAllowedService
{
    public Guid CounterId { get; set; }
    public Counter Counter { get; set; } = null!;
    public Guid ServiceTypeId { get; set; }
    public ServiceType ServiceType { get; set; } = null!;
    /// <summary>True if this assignment is temporary (e.g. manager override) and should auto-expire.</summary>
    public bool IsTemporary { get; set; }
    /// <summary>UTC expiry for temporary assignments. Null for permanent assignments.</summary>
    public DateTimeOffset? ExpiresAt { get; set; }
}
