namespace QMS.Domain.Entities;

/// <summary>Maps a counter to one allowed service lane. Empty collection on a counter = General (can serve all lanes).</summary>
public class CounterAllowedService
{
    public Guid CounterId { get; set; }
    public Counter Counter { get; set; } = null!;
    public Guid ServiceTypeId { get; set; }
    public ServiceType ServiceType { get; set; } = null!;
}
