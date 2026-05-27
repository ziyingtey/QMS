using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

public class QueueEntry
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public Guid ServiceTypeId { get; set; }
    public ServiceType ServiceType { get; set; } = null!;
    public string TicketNumber { get; set; } = string.Empty;
    public QueueEntryType EntryType { get; set; }
    public QueueEntryState State { get; set; } = QueueEntryState.Waiting;
    public Guid? BookingId { get; set; }
    public Booking? Booking { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CalledAt { get; set; }
    public DateTimeOffset? ServingStartedAt { get; set; }
    public DateTimeOffset? ServingEndedAt { get; set; }
    public Guid? CounterId { get; set; }
    public Counter? Counter { get; set; }
    /// <summary>Ordering within a slot: lower sequence = earlier in queue. Allocated per-slot.</summary>
    public long EnqueueSequence { get; set; }
    /// <summary>The assigned slot start time for this entry (online = booking slot, walk-in = assigned bucket).</summary>
    public DateTimeOffset? AssignedSlotStart { get; set; }
    /// <summary>The assigned slot end time for this entry.</summary>
    public DateTimeOffset? AssignedSlotEnd { get; set; }
    /// <summary>Whether the customer has physically arrived (check-in).</summary>
    public bool CheckedIn { get; set; }
}
