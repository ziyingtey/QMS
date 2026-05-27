using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// Periodic queue attendance: marks Called tickets as Missed after the branch grace window expires.
/// </summary>
public sealed class BookingLifecycleHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<BookingLifecycleHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Booking lifecycle tick failed");
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

        // Called tickets that exceeded grace window → Missed
        var calledEntries = await db.QueueEntries
            .Include(q => q.Booking)
            .Include(q => q.Branch)
            .Where(q => q.State == QueueEntryState.Called && q.CalledAt != null)
            .ToListAsync(ct);

        var branchIds = new HashSet<Guid>();

        foreach (var q in calledEntries)
        {
            var graceMin = Math.Max(1, q.Branch.CalledAbsentGraceMinutes);
            if (now < q.CalledAt!.Value.AddMinutes(graceMin))
                continue;

            q.State = QueueEntryState.Missed;
            q.CounterId = null;

            if (q.Booking is { } bk && bk.Status is BookingStatus.Confirmed or BookingStatus.CheckedIn)
                bk.Status = BookingStatus.Cancelled;

            branchIds.Add(q.BranchId);
        }

        if (branchIds.Count == 0)
            return;

        await db.SaveChangesAsync(ct);
        foreach (var bid in branchIds)
            await hub.Clients.Group(QueueHub.BranchGroup(bid)).SendAsync("QueueUpdated", bid, ct);
    }
}
