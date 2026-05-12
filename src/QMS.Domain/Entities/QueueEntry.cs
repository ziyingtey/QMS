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
    public long EnqueueSequence { get; set; }
    /// <summary>
    /// For walk-ins: which service time bucket’s <b>walk-in buffer</b> this ticket consumes.
    /// When the arrival-time bucket is full, the next bucket is used (overflow) while <see cref="CreatedAt"/> stays real.
    /// </summary>
    public DateTimeOffset? WalkInCapacityBucketStart { get; set; }
    public DateTimeOffset? WalkInCapacityBucketEnd { get; set; }
}
