using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// Captures ML training snapshots for online-booked tickets at the moment they become queue-eligible.
/// Runs every 15 seconds. Matches the training simulation (generate_seed_data.py / notebook):
/// queue_eligible_at = max(CheckedInAt, SlotStart - Branch.OnlineEarlyCallMinutes), and only for
/// tickets that have checked in (un-checked-in bookings are never Call Next eligible).
/// </summary>
public sealed class MlSnapshotHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<MlSnapshotHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

    /// <summary>Upper bound of Branch.OnlineEarlyCallMinutes (settings clamp to 0..120); used for the SQL pre-filter.</summary>
    private const int MaxEarlyCallMinutes = 120;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(8), stoppingToken); // stagger startup
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ML snapshot tick failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<QmsDbContext>();
        var now = DateTimeOffset.UtcNow;

        // FIX: previously any Waiting online ticket whose slot had started was snapshotted at SlotStart,
        // even if the customer never checked in. Training only has rows for checked-in customers, with
        // eligibility = max(CheckedInAt, SlotStart - EarlyCall). Pre-filter in SQL (checked in, slot within
        // the widest possible early-call window), then apply the branch's exact early-call in memory.
        var widestCutoff = now.AddMinutes(MaxEarlyCallMinutes);
        var candidates = await db.QueueEntries.AsNoTracking()
            .Where(q => q.EntryType == QueueEntryType.OnlineBooked
                        && q.State == QueueEntryState.Waiting
                        && q.CheckedIn
                        && q.AssignedSlotStart.HasValue
                        && q.AssignedSlotStart <= widestCutoff)
            .Select(q => new { q.Id, SlotStart = q.AssignedSlotStart!.Value, q.Branch.OnlineEarlyCallMinutes })
            .ToListAsync(ct);

        var eligibleIds = candidates
            .Where(c => c.SlotStart.AddMinutes(-c.OnlineEarlyCallMinutes) <= now)
            .Select(c => c.Id)
            .ToList();

        if (eligibleIds.Count == 0) return;

        // Exclude tickets that already have a snapshot
        var alreadySnapped = await db.MlTrainingObservations.AsNoTracking()
            .Where(o => eligibleIds.Contains(o.QueueEntryId))
            .Select(o => o.QueueEntryId)
            .ToListAsync(ct);

        var needSnapshot = eligibleIds.Except(alreadySnapped).ToList();
        if (needSnapshot.Count == 0) return;

        // Load full entries with branch + service (+ booking for CheckedInAt) for feature building
        var entries = await db.QueueEntries
            .Include(q => q.Branch)
            .Include(q => q.ServiceType)
            .Include(q => q.Booking)
            .Where(q => needSnapshot.Contains(q.Id))
            .ToListAsync(ct);

        var featureBuilder = new WaitTimeFeatureBuilder(db);
        var captured = 0;

        foreach (var entry in entries)
        {
            if (entry.Branch is null || entry.ServiceType is null) continue;

            // Check-in time is required to reconstruct the true eligibility moment; without it the
            // target (CalledAt - QueueEligibleAt) would not match training, so skip.
            var checkedInAt = entry.Booking?.CheckedInAt;
            if (checkedInAt is null)
            {
                logger.LogDebug("Skipping ML snapshot for {EntryId}: checked in but Booking.CheckedInAt is null", entry.Id);
                continue;
            }

            try
            {
                // Snapshot / QueueEligibleAt = max(CheckedInAt, SlotStart - EarlyCall), same as training.
                // Example: slot 10:00, early call 10, check-in 09:42 -> 09:50 (was 10:00);
                //          check-in 10:07 -> 10:07 (was 10:00, which made the target 7 min too long).
                var earlyOpen = entry.AssignedSlotStart!.Value.AddMinutes(-entry.Branch.OnlineEarlyCallMinutes);
                var eligibleAt = checkedInAt.Value > earlyOpen ? checkedInAt.Value : earlyOpen;

                // Time/slot features are computed as of eligibleAt (the tick lag is <= ~15 s normally).
                // Queue/counter state is read from the current DB rows (no history table to rewind).
                var features = await featureBuilder.BuildAsync(entry, entry.Branch, entry.ServiceType, eligibleAt, ct);
                var obs = WaitTimeFeatureBuilder.ToObservation(features, entry, eligibleAt, queueEligibleAt: eligibleAt);
                db.MlTrainingObservations.Add(obs);
                captured++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to capture ML snapshot for ticket {EntryId}", entry.Id);
            }
        }

        await db.SaveChangesAsync(ct);
        if (captured > 0)
            logger.LogInformation("Captured {Count} online ML snapshots", captured);
    }
}
