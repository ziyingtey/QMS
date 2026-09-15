using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

/// <summary>
/// Audit record for every slot movement on a QueueEntry.
/// Preserves the full history of slot reassignments (Pull Forward, reschedule, etc.).
/// </summary>
public class QueueMovement
{
    public Guid Id { get; set; }

    public Guid QueueEntryId { get; set; }
    public QueueEntry QueueEntry { get; set; } = null!;

    public DateTimeOffset? FromSlotStart { get; set; }
    public DateTimeOffset? FromSlotEnd { get; set; }
    public DateTimeOffset? ToSlotStart { get; set; }
    public DateTimeOffset? ToSlotEnd { get; set; }

    public long PreviousEnqueueSequence { get; set; }
    public long NewEnqueueSequence { get; set; }

    public DateTimeOffset MovedAt { get; set; } = DateTimeOffset.UtcNow;
    public QueueMovementReason Reason { get; set; }
}
