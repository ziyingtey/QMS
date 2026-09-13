using QMS.Domain.Enums;

namespace QMS.Application.Waiting;

/// <summary>
/// Ticket-to-call: operational queue time from when a ticket enters the call pool until called.
/// Not physical branch arrival or total time in branch.
/// </summary>
public static class TicketToCallMetrics
{
    /// <summary>
    /// When queue processing starts: walk-in at ticket issue; online at max(check-in or booking time, slot start).
    /// </summary>
    public static DateTimeOffset QueueStart(
        QueueEntryType entryType,
        DateTimeOffset createdAt,
        DateTimeOffset? checkedInAt,
        DateTimeOffset? assignedSlotStart)
    {
        if (entryType == QueueEntryType.OnlineBooked)
        {
            var anchor = checkedInAt ?? createdAt;
            if (assignedSlotStart is { } slot && slot > anchor)
                return slot;
            return anchor;
        }

        return createdAt;
    }

    public static double MinutesToCall(
        DateTimeOffset calledAt,
        QueueEntryType entryType,
        DateTimeOffset createdAt,
        DateTimeOffset? checkedInAt,
        DateTimeOffset? assignedSlotStart)
    {
        var start = QueueStart(entryType, createdAt, checkedInAt, assignedSlotStart);
        return Math.Max(0, (calledAt - start).TotalMinutes);
    }

    public static double MinutesInQueueNow(
        DateTimeOffset now,
        QueueEntryType entryType,
        DateTimeOffset createdAt,
        DateTimeOffset? checkedInAt,
        DateTimeOffset? assignedSlotStart)
    {
        var start = QueueStart(entryType, createdAt, checkedInAt, assignedSlotStart);
        return Math.Max(0, (now - start).TotalMinutes);
    }
}
