using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Hubs;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// Periodic queue lifecycle:
/// 1. Marks Called tickets as Missed after the branch grace window expires.
/// 2. Marks Confirmed bookings as NoShow when their slot ends without check-in.
/// 3. Cleans up expired temporary counter service assignments.
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
        var notifications = scope.ServiceProvider.GetRequiredService<CustomerNotificationService>();
        var now = DateTimeOffset.UtcNow;

        var branchIds = new HashSet<Guid>();

        // ── 1. Called tickets that exceeded grace window → Missed ──
        var calledEntries = await db.QueueEntries
            .Include(q => q.Booking)
            .Include(q => q.Branch)
            .Where(q => q.State == QueueEntryState.Called && q.CalledAt != null)
            .ToListAsync(ct);

        var missedForNotify = new List<(Guid CustomerId, Guid? BookingId, string Ticket, Guid BranchId)>();

        foreach (var q in calledEntries)
        {
            var graceMin = Math.Max(1, q.Branch.CalledAbsentGraceMinutes);
            if (now < q.CalledAt!.Value.AddMinutes(graceMin))
                continue;

            q.State = QueueEntryState.Missed;
            q.CounterId = null;

            if (q.Booking is { } bk && bk.Status is BookingStatus.Confirmed or BookingStatus.CheckedIn)
                bk.Status = BookingStatus.Cancelled;

            if (q.Booking?.CustomerId is Guid cid)
                missedForNotify.Add((cid, q.BookingId, q.TicketNumber, q.BranchId));

            branchIds.Add(q.BranchId);
        }

        // ── 2. NoShow: Confirmed bookings whose slot ended without check-in ──
        // Only targets Confirmed (not CheckedIn) bookings — if they checked in, they're in the queue.
        var noShowBookings = await db.Bookings
            .Include(b => b.QueueEntry)
            .Where(b => b.Status == BookingStatus.Confirmed
                        && b.SlotEnd <= now
                        && b.CheckedInAt == null)
            .ToListAsync(ct);

        foreach (var bk in noShowBookings)
        {
            bk.Status = BookingStatus.NoShow;

            if (bk.QueueEntry is { } qe && qe.State == QueueEntryState.Waiting)
            {
                qe.State = QueueEntryState.Missed;
                branchIds.Add(qe.BranchId);
            }

            missedForNotify.Add((bk.CustomerId, bk.Id, bk.QueueEntry?.TicketNumber ?? "N/A", bk.BranchId));
        }

        // ── 3. Cleanup expired temporary counter service assignments ──
        var expiredAssignments = await db.CounterAllowedServices
            .Include(a => a.Counter)
            .Where(a => a.IsTemporary && a.ExpiresAt.HasValue && a.ExpiresAt <= now)
            .ToListAsync(ct);

        foreach (var expired in expiredAssignments)
        {
            branchIds.Add(expired.Counter.BranchId);
            db.CounterAllowedServices.Remove(expired);
        }

        if (branchIds.Count == 0 && expiredAssignments.Count == 0)
            return;

        await db.SaveChangesAsync(ct);

        foreach (var (customerId, bookingId, ticket, branchId) in missedForNotify)
        {
            await notifications.NotifyAsync(
                customerId,
                NotificationKind.Missed,
                $"Ticket {ticket} was missed. Please take a new queue number if you still need service.",
                bookingId,
                ticket,
                branchId,
                ct);
        }

        foreach (var bid in branchIds)
        {
            await hub.Clients.Group(QueueHub.BranchGroup(bid)).SendAsync("QueueUpdated", bid, ct);
            await hub.Clients.Group(QueueHub.BranchGroup(bid)).SendAsync("CountersUpdated", bid, ct);
        }

        if (expiredAssignments.Count > 0)
            logger.LogInformation("Cleaned up {Count} expired temporary counter assignments", expiredAssignments.Count);
    }
}
