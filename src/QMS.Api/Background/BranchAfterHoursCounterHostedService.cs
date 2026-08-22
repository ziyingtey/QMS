using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// When a branch is outside operating hours (or manager-closed), sets every counter to Closed
/// and clears teller assignments so staff dashboards reflect after-hours state.
/// </summary>
public sealed class BranchAfterHoursCounterHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<BranchAfterHoursCounterHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(8), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "After-hours counter sweep failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<QmsDbContext>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<QueueHub>>();
        var now = DateTimeOffset.UtcNow;

        var branches = await db.Branches.AsNoTracking().ToListAsync(ct);
        if (branches.Count == 0)
            return;

        var hoursByBranch = await db.BranchOperatingHours.AsNoTracking()
            .GroupBy(h => h.BranchId)
            .ToDictionaryAsync(g => g.Key, g => (IReadOnlyList<BranchOperatingHour>)g.ToList(), ct);

        var notifyCounters = new HashSet<Guid>();
        var notifyQueue = new HashSet<Guid>();
        var closedCount = 0;

        foreach (var branch in branches)
        {
            hoursByBranch.TryGetValue(branch.Id, out var hours);
            hours ??= Array.Empty<BranchOperatingHour>();

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
            return;

        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "After-hours sweep closed {CounterCount} counter(s) across {BranchCount} branch(es) and cleared teller assignments.",
            closedCount,
            notifyCounters.Count);

        foreach (var branchId in notifyCounters)
            await hub.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, ct);

        foreach (var branchId in notifyQueue)
            await hub.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, ct);
    }
}
