using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// After-hours sweep: when a branch is outside operating hours, apply a drain window strategy.
/// During the drain window (configurable, default 60 min), counters with Called/Serving tickets
/// remain open and may keep calling already-waiting tickets. Counters are only closed when they
/// have no active ticket and the queue for their services is empty or the drain window has ended.
/// New walk-ins are blocked at close (enforced in WalkInAsync via IsBranchOpenNow check).
/// </summary>
public static class BranchAfterHoursCounterSweep
{
    public static async Task<int> RunAsync(
        QmsDbContext db,
        IHubContext<QueueHub> hub,
        ILogger logger,
        CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var branches = await db.Branches.AsNoTracking().ToListAsync(ct);
        if (branches.Count == 0)
            return 0;

        var hoursByBranch = await db.BranchOperatingHours.AsNoTracking()
            .GroupBy(h => h.BranchId)
            .ToDictionaryAsync(g => g.Key, g => g.ToList(), ct);

        var closuresByBranch = await db.BranchClosures.AsNoTracking()
            .Where(c => c.ClosedFrom <= now && c.ClosedTo >= now)
            .GroupBy(c => c.BranchId)
            .ToDictionaryAsync(g => g.Key, g => (IReadOnlyList<BranchClosure>)g.ToList(), ct);

        var notifyCounters = new HashSet<Guid>();
        var notifyQueue = new HashSet<Guid>();
        var closedCount = 0;

        foreach (var branch in branches)
        {
            if (!hoursByBranch.TryGetValue(branch.Id, out var hours))
                hours = [];
            closuresByBranch.TryGetValue(branch.Id, out var closures);

            if (BranchHoursEvaluator.IsBranchOpenNow(branch, hours, now, closures))
                continue;

            // Branch is closed — determine if we are within the drain window
            var inDrainWindow = BranchHoursEvaluator.IsInDrainWindow(now, branch, hours);

            var counters = await db.Counters
                .Where(c => c.BranchId == branch.Id
                            && (c.Mode != CounterMode.Closed || c.StaffId != null))
                .ToListAsync(ct);

            if (counters.Count == 0)
                continue;

            // Active tickets on each counter (Called or Serving)
            var activeTicketCounterIds = await db.QueueEntries
                .Where(q => q.BranchId == branch.Id
                            && q.CounterId != null
                            && (q.State == QueueEntryState.Called || q.State == QueueEntryState.Serving))
                .Select(q => q.CounterId!.Value)
                .Distinct()
                .ToListAsync(ct);
            var activeTicketSet = activeTicketCounterIds.ToHashSet();

            // Waiting tickets per service (for drain check)
            HashSet<Guid> servicesWithWaiting = [];
            if (inDrainWindow)
            {
                servicesWithWaiting = (await db.QueueEntries
                    .Where(q => q.BranchId == branch.Id && q.State == QueueEntryState.Waiting && q.CheckedIn)
                    .Select(q => q.ServiceTypeId)
                    .Distinct()
                    .ToListAsync(ct)).ToHashSet();
            }

            // Counter-to-services mapping
            var counterServices = await db.Set<CounterAllowedService>()
                .Where(cas => counters.Select(c => c.Id).Contains(cas.CounterId))
                .GroupBy(cas => cas.CounterId)
                .ToDictionaryAsync(g => g.Key, g => g.Select(x => x.ServiceTypeId).ToHashSet(), ct);

            foreach (var counter in counters)
            {
                // Never close a counter that has an active (Called/Serving) ticket
                if (activeTicketSet.Contains(counter.Id))
                    continue;

                if (inDrainWindow)
                {
                    // Keep the counter open if its services still have waiting tickets
                    counterServices.TryGetValue(counter.Id, out var svcIds);
                    if (svcIds != null && svcIds.Any(s => servicesWithWaiting.Contains(s)))
                        continue;
                }

                // Close this counter
                counter.Mode = CounterMode.Closed;
                counter.StaffId = null;
                closedCount++;
                notifyCounters.Add(branch.Id);
                notifyQueue.Add(branch.Id);
            }
        }

        if (closedCount == 0)
            return 0;

        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "After-hours sweep closed {CounterCount} counter(s) across {BranchCount} branch(es) and cleared teller assignments.",
            closedCount,
            notifyCounters.Count);

        foreach (var branchId in notifyCounters)
            await hub.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, ct);

        foreach (var branchId in notifyQueue)
            await hub.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, ct);

        return closedCount;
    }

}
