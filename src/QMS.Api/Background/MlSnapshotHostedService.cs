using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Background;

/// <summary>
/// Captures ML training snapshots for online-booked tickets when their assigned slot starts.
/// Runs every 15 seconds. For each Waiting online ticket whose AssignedSlotStart has arrived
/// and has no existing snapshot, builds features and records an MlTrainingObservation.
/// </summary>
public sealed class MlSnapshotHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<MlSnapshotHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

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

        // Find online-booked tickets whose slot has started, still Waiting, and no snapshot yet
        var candidates = await db.QueueEntries.AsNoTracking()
            .Where(q => q.EntryType == QueueEntryType.OnlineBooked
                        && q.State == QueueEntryState.Waiting
                        && q.AssignedSlotStart.HasValue
                        && q.AssignedSlotStart <= now)
            .Select(q => q.Id)
            .ToListAsync(ct);

        if (candidates.Count == 0) return;

        // Exclude tickets that already have a snapshot
        var alreadySnapped = await db.MlTrainingObservations.AsNoTracking()
            .Where(o => candidates.Contains(o.QueueEntryId))
            .Select(o => o.QueueEntryId)
            .ToListAsync(ct);

        var needSnapshot = candidates.Except(alreadySnapped).ToList();
        if (needSnapshot.Count == 0) return;

        // Load full entries with branch + service for feature building
        var entries = await db.QueueEntries
            .Include(q => q.Branch)
            .Include(q => q.ServiceType)
            .Where(q => needSnapshot.Contains(q.Id))
            .ToListAsync(ct);

        var featureBuilder = new WaitTimeFeatureBuilder(db);

        foreach (var entry in entries)
        {
            if (entry.Branch is null || entry.ServiceType is null) continue;

            try
            {
                // Snapshot time = SlotStart (the moment the ticket becomes queue-eligible)
                var snapshotAt = entry.AssignedSlotStart!.Value;
                // If slot started a while ago, use SlotStart (not now) to avoid temporal drift.
                // But features like queue state are current — acceptable trade-off for real-time capture.
                // Use 'now' for features since we can't go back in time for queue state.
                var features = await featureBuilder.BuildAsync(entry, entry.Branch, entry.ServiceType, now, ct);
                var obs = WaitTimeFeatureBuilder.ToObservation(features, entry, snapshotAt);
                db.MlTrainingObservations.Add(obs);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to capture ML snapshot for ticket {EntryId}", entry.Id);
            }
        }

        await db.SaveChangesAsync(ct);
        if (needSnapshot.Count > 0)
            logger.LogInformation("Captured {Count} online ML snapshots", needSnapshot.Count);
    }
}
