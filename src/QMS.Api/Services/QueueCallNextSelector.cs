using QMS.Domain.Entities;

namespace QMS.Api.Services;

/// <summary>
/// Call Next selection: among all eligible tickets for a counter (one flat list —
/// not per-queue heads), earliest <see cref="QueueEntry.CreatedAt"/> wins
/// (online booking time / walk-in take-number time), then <see cref="QueueEntry.Id"/>
/// for a stable tiebreak.
/// Eligibility is applied by the caller; this type only orders / picks.
/// </summary>
public static class QueueCallNextSelector
{
    /// <summary>Wait-ordering key for Call Next fairness (= booking / take-number time).</summary>
    public static DateTimeOffset WaitStart(QueueEntry e) => e.CreatedAt;

    /// <summary>
    /// Pick the next ticket Call Next should claim from an already-eligible pool.
    /// </summary>
    public static QueueEntry? SelectLongestWaitQueueHead(
        IReadOnlyList<QueueEntry> eligible,
        DateTimeOffset nowUtc)
    {
        _ = nowUtc; // kept for call-site compatibility; eligibility is caller-side
        if (eligible.Count == 0) return null;

        return eligible
            .OrderBy(e => e.CreatedAt)
            .ThenBy(e => e.Id)
            .FirstOrDefault();
    }

    /// <summary>
    /// Order tickets the way successive Call Next picks would drain them
    /// (single counter listening to the given eligible pool).
    /// </summary>
    public static List<QueueEntry> OrderByCallNextDrain(
        IEnumerable<QueueEntry> tickets,
        DateTimeOffset nowUtc)
    {
        _ = nowUtc;
        return tickets
            .OrderBy(e => e.CreatedAt)
            .ThenBy(e => e.Id)
            .ToList();
    }
}
