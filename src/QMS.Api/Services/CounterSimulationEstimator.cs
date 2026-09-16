using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Counter availability simulation-based wait time estimator.
/// Simulates counter-by-counter ticket assignment in Call Next priority order
/// to estimate when a specific queue entry will be served.
///
/// Eligibility rules exactly match Call Next:
///   - Walk-ins: always eligible (CheckedIn = true)
///   - Online: eligible when SlotStart - EarlyCallMinutes &lt;= now
///   - P0: checked-in online with active slot window → served first
///   - P1: everything else → FIFO by EnqueueSequence
///
/// Future online appointments that have not entered the queue are excluded.
/// </summary>
public sealed class CounterSimulationEstimator(QmsDbContext db)
{
    /// <summary>
    /// Simulate counter availability and return estimated wait in minutes for <paramref name="myEntry"/>.
    /// </summary>
    public async Task<double> EstimateAsync(
        QueueEntry myEntry,
        int earlyCallMinutes,
        DateTimeOffset nowUtc,
        CancellationToken ct = default)
    {
        // ── 1. Load active counters with allowed services ──
        var counters = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == myEntry.BranchId && c.Mode == CounterMode.Active)
            .ToListAsync(ct);

        if (counters.Count == 0)
            return double.PositiveInfinity;

        // Collect all service IDs any active counter can serve
        var allServiceIds = counters
            .SelectMany(c => c.AllowedServices.Select(a => a.ServiceTypeId))
            .Distinct()
            .ToList();

        // If no counter can serve myEntry's service, infinite wait
        if (!allServiceIds.Contains(myEntry.ServiceTypeId))
            return double.PositiveInfinity;

        // ── 2. Average service duration per service type ──
        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => allServiceIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, ct);

        var cutoff = nowUtc.AddDays(-30);
        var rollingAvgs = await db.ServiceSessionLogs.AsNoTracking()
            .Where(l => allServiceIds.Contains(l.ServiceTypeId)
                        && l.EndedAt < nowUtc && l.EndedAt >= cutoff
                        && l.DurationSeconds > 0)
            .GroupBy(l => l.ServiceTypeId)
            .Select(g => new { ServiceId = g.Key, AvgMin = g.Average(l => l.DurationSeconds) / 60.0 })
            .ToDictionaryAsync(x => x.ServiceId, x => x.AvgMin, ct);

        double AvgDuration(Guid serviceId) =>
            rollingAvgs.TryGetValue(serviceId, out var avg) ? avg
            : services.TryGetValue(serviceId, out var svc) ? svc.DefaultAvgServiceMinutes
            : 5;

        // ── 3. Build counter free-at timeline (minutes from now) ──
        var servingEntries = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == myEntry.BranchId
                        && q.State == QueueEntryState.Serving
                        && q.CounterId != null)
            .ToListAsync(ct);

        var counterFreeAt = new Dictionary<Guid, double>();
        foreach (var c in counters)
        {
            var serving = servingEntries.FirstOrDefault(q => q.CounterId == c.Id);
            if (serving?.ServingStartedAt is { } started)
            {
                var elapsed = (nowUtc - started).TotalMinutes;
                var remaining = Math.Max(0, AvgDuration(serving.ServiceTypeId) - elapsed);
                counterFreeAt[c.Id] = remaining;
            }
            else
            {
                counterFreeAt[c.Id] = 0;
            }
        }

        // ── 4. Service → eligible counter mapping ──
        var serviceCounterMap = new Dictionary<Guid, List<Guid>>();
        foreach (var c in counters)
        {
            foreach (var a in c.AllowedServices)
            {
                if (!serviceCounterMap.TryGetValue(a.ServiceTypeId, out var list))
                {
                    list = new List<Guid>();
                    serviceCounterMap[a.ServiceTypeId] = list;
                }
                list.Add(c.Id);
            }
        }

        // ── 5. Get all eligible waiting tickets in Call Next priority order ──
        var tickets = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == myEntry.BranchId
                        && allServiceIds.Contains(q.ServiceTypeId)
                        && q.State == QueueEntryState.Waiting)
            .Where(q =>
                q.CheckedIn
                || (q.EntryType == QueueEntryType.OnlineBooked
                    && q.AssignedSlotStart.HasValue
                    && q.AssignedSlotStart.Value.AddMinutes(-earlyCallMinutes) <= nowUtc)
                || q.Id == myEntry.Id) // always include myEntry even if not yet eligible
            .ToListAsync(ct);

        // Sort: P0 (checked-in online in active slot) first, then FIFO by EnqueueSequence
        tickets.Sort((a, b) =>
        {
            var pa = Priority(a, nowUtc);
            var pb = Priority(b, nowUtc);
            if (pa != pb) return pa.CompareTo(pb);
            return a.EnqueueSequence.CompareTo(b.EnqueueSequence);
        });

        // ── 6. Simulate assignment ──
        foreach (var ticket in tickets)
        {
            if (!serviceCounterMap.TryGetValue(ticket.ServiceTypeId, out var eligibleCounterIds))
            {
                // No counter can serve this ticket — skip
                if (ticket.Id == myEntry.Id) return double.PositiveInfinity;
                continue;
            }

            // Find earliest-free counter among those that can serve this ticket
            Guid bestCounter = default;
            var bestFreeAt = double.MaxValue;
            foreach (var cid in eligibleCounterIds)
            {
                if (counterFreeAt.TryGetValue(cid, out var freeAt) && freeAt < bestFreeAt)
                {
                    bestFreeAt = freeAt;
                    bestCounter = cid;
                }
            }

            if (bestFreeAt == double.MaxValue)
            {
                if (ticket.Id == myEntry.Id) return double.PositiveInfinity;
                continue;
            }

            // If this is my entry, the ETA is when this counter becomes free
            if (ticket.Id == myEntry.Id)
                return Math.Max(0, bestFreeAt);

            // Otherwise, occupy the counter for this ticket's expected duration
            counterFreeAt[bestCounter] = bestFreeAt + AvgDuration(ticket.ServiceTypeId);
        }

        // myEntry wasn't in the list (shouldn't happen) — fallback
        return 0;
    }

    private static int Priority(QueueEntry entry, DateTimeOffset nowUtc) =>
        entry.EntryType == QueueEntryType.OnlineBooked && entry.CheckedIn
        && entry.AssignedSlotStart.HasValue && entry.AssignedSlotStart <= nowUtc
        && entry.AssignedSlotEnd.HasValue && entry.AssignedSlotEnd > nowUtc
            ? 0 : 1;
}
