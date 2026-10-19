using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Counter availability simulation matching Call Next:
/// when a counter frees, it pulls earliest-CreatedAt eligible ticket among its AllowedServices.
/// Also the ML feature CounterSimEtaMinutes (WaitTimeFeatureBuilder); mirrored exactly by counter_sim_eta in
/// ml/generate_seed_data.py + the notebook, so keep both in sync.
/// </summary>
public sealed class CounterSimulationEstimator(QmsDbContext db)
{
    public async Task<double> EstimateAsync(
        QueueEntry myEntry,
        int earlyCallMinutes,
        DateTimeOffset nowUtc,
        CancellationToken ct = default)
    {
        var counters = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == myEntry.BranchId && c.Mode == CounterMode.Active)
            .ToListAsync(ct);

        if (counters.Count == 0)
            return double.PositiveInfinity;

        var allServiceIds = counters
            .SelectMany(c => c.AllowedServices.Select(a => a.ServiceTypeId))
            .Distinct()
            .ToList();

        if (!allServiceIds.Contains(myEntry.ServiceTypeId))
            return double.PositiveInfinity;

        // Busy counters: Called (customer walking up, counter already claimed the ticket) or Serving.
        // Was: Serving only, so a counter that had just called someone looked free.
        var servingEntries = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == myEntry.BranchId
                        && (q.State == QueueEntryState.Serving || q.State == QueueEntryState.Called)
                        && q.CounterId != null)
            .ToListAsync(ct);

        var avgServiceIds = allServiceIds.Union(servingEntries.Select(q => q.ServiceTypeId)).ToList();
        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => avgServiceIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, ct);

        // Average duration per service = the shared RollingServiceAverage rule (last 30 completed services,
        // ignoring < 30 s, at least 5 valid, else DefaultAvgServiceMinutes). Was: 30-day mean of every log
        // > 0 s, so a few seconds-long test services made a 15-min service look like 0.05 min.
        var rollingAvgs = new Dictionary<Guid, double>();
        foreach (var serviceId in avgServiceIds)
        {
            var fallback = services.TryGetValue(serviceId, out var svc) ? svc.DefaultAvgServiceMinutes : 5;
            rollingAvgs[serviceId] = await RollingServiceAverage.MinutesAsync(db, [serviceId], nowUtc, fallback, ct);
        }

        double AvgDuration(Guid serviceId) => rollingAvgs.TryGetValue(serviceId, out var avg) ? avg : 5;

        var counterFreeAt = new Dictionary<Guid, double>();
        var counterServices = new Dictionary<Guid, HashSet<Guid>>();
        foreach (var c in counters)
        {
            counterServices[c.Id] = c.AllowedServices.Select(a => a.ServiceTypeId).ToHashSet();
            var serving = servingEntries.FirstOrDefault(q => q.CounterId == c.Id);
            if (serving is not null && (serving.ServingStartedAt ?? serving.CalledAt) is { } started)
            {
                var elapsed = (nowUtc - started).TotalMinutes;
                counterFreeAt[c.Id] = Math.Max(0, AvgDuration(serving.ServiceTypeId) - elapsed);
            }
            else
            {
                counterFreeAt[c.Id] = 0;
            }
        }

        var tickets = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == myEntry.BranchId
                        && allServiceIds.Contains(q.ServiceTypeId)
                        && q.State == QueueEntryState.Waiting)
            .Where(q =>
                (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
                || (q.EntryType == QueueEntryType.OnlineBooked
                    && q.CheckedIn
                    && q.AssignedSlotStart.HasValue
                    && q.AssignedSlotStart.Value.AddMinutes(-earlyCallMinutes) <= nowUtc)
                || q.Id == myEntry.Id)
            .ToListAsync(ct);

        if (tickets.All(q => q.Id != myEntry.Id))
            tickets.Add(myEntry);

        var remaining = tickets.ToList();
        var guard = 0;
        while (remaining.Count > 0 && guard++ < 2000)
        {
            Guid bestCounter = default;
            QueueEntry? bestTicket = null;
            var bestFreeAt = double.MaxValue;

            foreach (var c in counters)
            {
                var lane = remaining
                    .Where(q => counterServices[c.Id].Contains(q.ServiceTypeId))
                    .ToList();
                var head = QueueCallNextSelector.SelectLongestWaitQueueHead(lane, nowUtc);
                if (head is null) continue;
                if (!counterFreeAt.TryGetValue(c.Id, out var freeAt)) continue;
                if (freeAt < bestFreeAt
                    || (Math.Abs(freeAt - bestFreeAt) < 1e-9
                        && bestTicket is not null
                        && QueueCallNextSelector.WaitStart(head) < QueueCallNextSelector.WaitStart(bestTicket)))
                {
                    bestFreeAt = freeAt;
                    bestCounter = c.Id;
                    bestTicket = head;
                }
            }

            if (bestTicket is null)
                return remaining.Any(q => q.Id == myEntry.Id) ? double.PositiveInfinity : 0;

            if (bestTicket.Id == myEntry.Id)
                return Math.Max(Math.Max(0, bestFreeAt), MinutesUntilEligible(myEntry, earlyCallMinutes, nowUtc));

            remaining.RemoveAll(q => q.Id == bestTicket.Id);
            counterFreeAt[bestCounter] = bestFreeAt + AvgDuration(bestTicket.ServiceTypeId);
        }

        return MinutesUntilEligible(myEntry, earlyCallMinutes, nowUtc);
    }

    /// <summary>
    /// Minutes until my own ticket becomes Call Next eligible (0 for walk-ins and open windows). An online
    /// booking checked in before its early-call window cannot be called before SlotStart - EarlyCall.
    /// Example: slot 11:30, early call 10, now 10:50 -> 30.
    /// </summary>
    private static double MinutesUntilEligible(QueueEntry me, int earlyCallMinutes, DateTimeOffset nowUtc) =>
        me.EntryType == QueueEntryType.OnlineBooked && me.AssignedSlotStart is { } slotStart
            ? Math.Max(0, (slotStart.AddMinutes(-earlyCallMinutes) - nowUtc).TotalMinutes)
            : 0;
}
