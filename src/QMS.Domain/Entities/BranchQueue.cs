namespace QMS.Domain.Entities;

/// <summary>
/// First-class service queue (档 B). Tickets are issued into a queue; counters listen to queues
/// via the services mapped to those queues (AllowedServices → ServiceType.QueueId).
/// </summary>
public class BranchQueue
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;

    /// <summary>Display name, usually mirrors the primary service name.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Ticket letter prefix, e.g. "A", "B", "DEP".</summary>
    public string TicketPrefix { get; set; } = "A";

    /// <summary>Target max wait minutes for this queue (SLA / insights).</summary>
    public int ServiceLevelMinutes { get; set; } = 15;

    /// <summary>When true, manager can hide the queue from walk-in kiosks later.</summary>
    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<ServiceType> Services { get; set; } = new List<ServiceType>();
    public ICollection<QueueEntry> QueueEntries { get; set; } = new List<QueueEntry>();
}
