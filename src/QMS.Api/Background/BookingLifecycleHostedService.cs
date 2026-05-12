using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>Periodic late / no-show policy: degrades unchecked online bookings after slot start, removes no-shows after slot end.</summary>
public sealed class BookingLifecycleHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<BookingLifecycleHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);
    private const int LateGraceMinutes = 10;
    private const int NoShowAfterSlotEndMinutes = 5;

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

        var bookings = await db.Bookings
            .Include(b => b.QueueEntry)
            .Where(b => b.Status == BookingStatus.Confirmed && b.CheckedInAt == null && b.QueueEntry != null)
            .ToListAsync(ct);

        var branchIds = new HashSet<Guid>();

        foreach (var b in bookings)
        {
            var q = b.QueueEntry!;
            if (q.State != QueueEntryState.Waiting)
                continue;

            if (now >= b.SlotEnd.AddMinutes(NoShowAfterSlotEndMinutes))
            {
                b.Status = BookingStatus.NoShow;
                q.State = QueueEntryState.Absent;
                branchIds.Add(b.BranchId);
                continue;
            }

            if (now >= b.SlotStart.AddMinutes(LateGraceMinutes)
                && q.EntryType == QueueEntryType.OnlineBooked)
            {
                q.EntryType = QueueEntryType.LateDegraded;
                branchIds.Add(b.BranchId);
            }
        }

        if (branchIds.Count == 0)
            return;

        await db.SaveChangesAsync(ct);
        foreach (var bid in branchIds)
            await hub.Clients.Group(QueueHub.BranchGroup(bid)).SendAsync("QueueUpdated", bid, ct);
    }
}
