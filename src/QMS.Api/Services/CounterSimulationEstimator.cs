using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Counter availability simulation matching 档 B Call Next:
/// when a counter frees, it pulls the longest-wait queue head among its AllowedServices.
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

        var servingEntries = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == myEntry.BranchId
                        && q.State == QueueEntryState.Serving
                        && q.CounterId != null)
            .ToListAsync(ct);

        var counterFreeAt = new Dictionary<Guid, double>();
        var counterServices = new Dictionary<Guid, HashSet<Guid>>();
        foreach (var c in counters)
        {
            counterServices[c.Id] = c.AllowedServices.Select(a => a.ServiceTypeId).ToHashSet();
            var serving = servingEntries.FirstOrDefault(q => q.CounterId == c.Id);
            if (serving?.ServingStartedAt is { } started)
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
                return Math.Max(0, bestFreeAt);

            remaining.RemoveAll(q => q.Id == bestTicket.Id);
            counterFreeAt[bestCounter] = bestFreeAt + AvgDuration(bestTicket.ServiceTypeId);
        }

        return 0;
    }
}
