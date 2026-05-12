using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// When the branch-local calendar day advances, clears open queue rows from before that midnight so
/// staff/manager dashboards start the new day without yesterday’s waiting pile.
/// </summary>
public sealed class BranchQueueDayRolloverHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<BranchQueueDayRolloverHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(45);
    private static readonly ConcurrentDictionary<Guid, DateOnly> LastProcessedLocalDay = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(12), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Branch day rollover tick failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<QmsDbContext>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<QueueHub>>();

        var branches = await db.Branches.AsNoTracking()
            .Select(b => new { b.Id, b.ServiceZoneOffsetMinutes })
            .ToListAsync(ct);

        var notify = new HashSet<Guid>();

        foreach (var br in branches)
        {
            var zone = TimeSpan.FromMinutes(br.ServiceZoneOffsetMinutes);
            var nowB = DateTimeOffset.UtcNow.ToOffset(zone);
            var today = DateOnly.FromDateTime(nowB.DateTime);
            var startOfToday = new DateTimeOffset(nowB.Year, nowB.Month, nowB.Day, 0, 0, 0, zone);

            if (!LastProcessedLocalDay.TryGetValue(br.Id, out var lastDay))
            {
                await PurgeOpenQueuesBeforeAsync(br.Id, startOfToday, db, ct);
                LastProcessedLocalDay[br.Id] = today;
                var saved = await db.SaveChangesAsync(ct);
                if (saved > 0)
                {
                    notify.Add(br.Id);
                    logger.LogInformation("Branch {BranchId} initial day cleanup cleared {Count} open queue row(s) before {Start}.", br.Id, saved, startOfToday);
                }
                continue;
            }

            if (lastDay == today)
                continue;

            await PurgeOpenQueuesBeforeAsync(br.Id, startOfToday, db, ct);
            LastProcessedLocalDay[br.Id] = today;
            var rolloverSaved = await db.SaveChangesAsync(ct);
            if (rolloverSaved > 0)
            {
                notify.Add(br.Id);
                logger.LogInformation("Branch {BranchId} day rollover cleared {Count} open queue row(s) before {Start}.", br.Id, rolloverSaved, startOfToday);
            }
        }

        foreach (var branchId in notify)
            await hub.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, ct);
    }

    private static async Task PurgeOpenQueuesBeforeAsync(
        Guid branchId,
        DateTimeOffset startOfToday,
        QmsDbContext db,
        CancellationToken ct)
    {
        var entries = await db.QueueEntries
            .Include(q => q.Booking)
            .Where(q => q.BranchId == branchId
                        && (q.State == QueueEntryState.Waiting
                            || q.State == QueueEntryState.Called
                            || q.State == QueueEntryState.Serving)
                        && q.CreatedAt < startOfToday)
            .ToListAsync(ct);

        foreach (var q in entries)
        {
            q.State = QueueEntryState.Absent;
            if (q.Booking is { } b)
            {
                if (b.Status == BookingStatus.Pending)
                    b.Status = BookingStatus.Cancelled;
                else if (b.Status == BookingStatus.Confirmed)
                    b.Status = BookingStatus.NoShow;
            }
        }
    }
}
