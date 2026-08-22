using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// Closes counters and clears teller assignments when a branch is outside operating hours.
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

        var notifyCounters = new HashSet<Guid>();
        var notifyQueue = new HashSet<Guid>();
        var closedCount = 0;

        foreach (var branch in branches)
        {
            if (!hoursByBranch.TryGetValue(branch.Id, out var hours))
                hours = [];

            if (BranchHoursEvaluator.IsBranchOpenNow(branch, hours, now))
                continue;

            var counters = await db.Counters
                .Where(c => c.BranchId == branch.Id
                            && (c.Mode != CounterMode.Closed || c.StaffId != null))
                .ToListAsync(ct);

            if (counters.Count == 0)
                continue;

            foreach (var counter in counters)
            {
                counter.Mode = CounterMode.Closed;
                counter.StaffId = null;
            }

            closedCount += counters.Count;
            notifyCounters.Add(branch.Id);
            notifyQueue.Add(branch.Id);
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
