using QMS.Domain.Entities;
using QMS.Domain.Enums;

namespace QMS.Application.Queue;

/// <summary>
/// <b>At the counter (who gets called next):</b> weighted <b>2 online : 1 walk-in</b> round (persist <paramref name="onlineTakenInRound"/> 0..2 per branch+lane).
/// Callers should pass only one <b>slot wave</b> (same effective service window) when using slot-aware dispatch.
/// Among <b>online</b> tickets: checked-in first, then earlier <c>SlotStart</c>, then enqueue order.
/// Among <b>walk-ins</b>: earlier enqueue (aligned to walk-in capacity bucket / appointment-style sequence).
/// If walk-ins are a large share of the waiting line (<paramref name="walkInBacklogRatio"/> ≥ <paramref name="walkInBoostThreshold"/>), the next pick is forced to a walk-in to reduce walk-in starvation.
/// </summary>
public static class HybridDispatch
{
    public static (QueueEntry? Next, int OnlineTakenInRoundAfter) PickNext(
        IReadOnlyList<QueueEntry> waiting,
        int onlineTakenInRound,
        double walkInBacklogRatio,
        double walkInBoostThreshold = 0.55)
    {
        if (waiting.Count == 0) return (null, onlineTakenInRound);

        if (walkInBacklogRatio >= walkInBoostThreshold)
        {
            var w = waiting
                .Where(e => e.EntryType is QueueEntryType.WalkIn or QueueEntryType.LateDegraded)
                .OrderBy(e => e.EnqueueSequence)
                .FirstOrDefault();
            if (w is not null) return (w, onlineTakenInRound);
        }

        var onlines = waiting
            .Where(e => e.EntryType == QueueEntryType.OnlineBooked)
            .OrderBy(e => e.Booking is { Status: BookingStatus.CheckedIn } ? 0 : 1)
            .ThenBy(e => e.Booking?.SlotStart ?? DateTimeOffset.MaxValue)
            .ThenBy(e => e.EnqueueSequence)
            .ToList();
        var walkIns = waiting
            .Where(e => e.EntryType is QueueEntryType.WalkIn or QueueEntryType.LateDegraded)
            .OrderBy(e => e.EnqueueSequence)
            .ToList();

        if (onlines.Count == 0 && walkIns.Count == 0)
            return (waiting.OrderBy(e => e.EnqueueSequence).FirstOrDefault(), 0);

        if (onlineTakenInRound < 2 && onlines.Count > 0)
            return (onlines[0], onlineTakenInRound + 1);

        if (walkIns.Count > 0) return (walkIns[0], 0);
        if (onlines.Count > 0)
        {
            var nextStreak = onlineTakenInRound >= 2 ? 1 : onlineTakenInRound + 1;
            return (onlines[0], nextStreak);
        }

        return (waiting.OrderBy(e => e.EnqueueSequence).FirstOrDefault(), 0);
    }
}
