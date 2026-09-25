using QMS.Domain.Entities;
using QMS.Domain.Enums;

namespace QMS.Api.Services;

/// <summary>
/// 档 B Call Next selection: per-queue head (P0 then EnqueueSequence),
/// then among heads prefer any P0, then longest wait (earliest QueueEligibleAt).
/// </summary>
public static class QueueCallNextSelector
{
    public static int Priority(QueueEntry e, DateTimeOffset nowUtc) =>
        e.EntryType == QueueEntryType.OnlineBooked && e.CheckedIn
        && e.AssignedSlotStart.HasValue && e.AssignedSlotStart <= nowUtc
        && e.AssignedSlotEnd.HasValue && e.AssignedSlotEnd > nowUtc
            ? 0 : 1;

    public static DateTimeOffset WaitStart(QueueEntry e) =>
        e.QueueEligibleAt ?? e.CreatedAt;

    public static QueueEntry? SelectLongestWaitQueueHead(
        IReadOnlyList<QueueEntry> eligible,
        DateTimeOffset nowUtc)
    {
        if (eligible.Count == 0) return null;

        var heads = eligible
            .GroupBy(q => q.QueueId ?? q.ServiceTypeId)
            .Select(g => g
                .OrderBy(q => Priority(q, nowUtc))
                .ThenBy(q => q.EnqueueSequence)
                .First())
            .ToList();

        var p0 = heads.Where(h => Priority(h, nowUtc) == 0).ToList();
        var pool = p0.Count > 0 ? p0 : heads;
        return pool
            .OrderBy(h => WaitStart(h))
            .ThenBy(h => h.EnqueueSequence)
            .FirstOrDefault();
    }

    /// <summary>
    /// Order tickets the way successive Call Next picks would drain them
    /// (single counter listening to the given pool).
    /// </summary>
    public static List<QueueEntry> OrderByCallNextDrain(
        IEnumerable<QueueEntry> tickets,
        DateTimeOffset nowUtc)
    {
        var remaining = tickets.ToList();
        var ordered = new List<QueueEntry>(remaining.Count);
        while (remaining.Count > 0)
        {
            var next = SelectLongestWaitQueueHead(remaining, nowUtc);
            if (next is null) break;
            ordered.Add(next);
            remaining.RemoveAll(q => q.Id == next.Id);
            if (ordered.Count > 2000) break;
        }
        return ordered;
    }
}
