using Microsoft.EntityFrameworkCore;
using QMS.Application.Waiting;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Centralized builder for wait-time prediction features.
/// Single source of truth: training snapshots and real-time predictions use the same code path.
/// All features represent state at <paramref name="snapshotAt"/> — never future information.
/// </summary>
public sealed class WaitTimeFeatureBuilder(QmsDbContext db)
{
    /// <summary>
    /// Build features for a specific queue entry at a given moment in time.
    /// </summary>
    public async Task<WaitTimeFeatures> BuildAsync(
        QueueEntry entry,
        Branch branch,
        ServiceType service,
        DateTimeOffset snapshotAt,
        CancellationToken ct = default)
    {
        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var localTime = snapshotAt.ToOffset(zone);
        var hour = localTime.Hour;
        var isPeak = (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16);

        // Queue state: all waiting tickets for this branch+service at snapshot time
        var waitingQuery = db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == entry.BranchId
                        && q.ServiceTypeId == entry.ServiceTypeId
                        && q.State == QueueEntryState.Waiting);

        var queueLength = await waitingQuery.CountAsync(ct);

        var onlineQueueLength = await waitingQuery
            .Where(q => q.EntryType == QueueEntryType.OnlineBooked)
            .CountAsync(ct);
        var walkInQueueLength = queueLength - onlineQueueLength;

        // People ahead: same eligibility + priority rules as Call Next
        var earlyCallMinutes = branch.OnlineEarlyCallMinutes;

        // Only count eligible tickets
        var eligibleAhead = waitingQuery.Where(q =>
            (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
            || (q.EntryType == QueueEntryType.OnlineBooked
                && q.CheckedIn
                && q.AssignedSlotStart.HasValue
                && q.AssignedSlotStart.Value.AddMinutes(-earlyCallMinutes) <= snapshotAt));

        // Determine this entry's priority (P0 = online checked-in in active slot, P1 = rest)
        var myIsP0 = entry.EntryType == QueueEntryType.OnlineBooked && entry.CheckedIn
                     && entry.AssignedSlotStart.HasValue && entry.AssignedSlotStart <= snapshotAt
                     && entry.AssignedSlotEnd.HasValue && entry.AssignedSlotEnd > snapshotAt;

        int peopleAhead;
        if (myIsP0)
        {
            // P0: only other P0 with smaller EnqueueSequence are ahead
            peopleAhead = await eligibleAhead.CountAsync(q =>
                q.EntryType == QueueEntryType.OnlineBooked && q.CheckedIn
                && q.AssignedSlotStart.HasValue && q.AssignedSlotStart <= snapshotAt
                && q.AssignedSlotEnd.HasValue && q.AssignedSlotEnd > snapshotAt
                && q.EnqueueSequence < entry.EnqueueSequence, ct);
        }
        else
        {
            // P1: all P0 are ahead, plus P1 with smaller EnqueueSequence
            var p0Ahead = await eligibleAhead.CountAsync(q =>
                q.EntryType == QueueEntryType.OnlineBooked && q.CheckedIn
                && q.AssignedSlotStart.HasValue && q.AssignedSlotStart <= snapshotAt
                && q.AssignedSlotEnd.HasValue && q.AssignedSlotEnd > snapshotAt, ct);

            var p1Ahead = await eligibleAhead.CountAsync(q =>
                !(q.EntryType == QueueEntryType.OnlineBooked && q.CheckedIn
                  && q.AssignedSlotStart.HasValue && q.AssignedSlotStart <= snapshotAt
                  && q.AssignedSlotEnd.HasValue && q.AssignedSlotEnd > snapshotAt)
                && q.EnqueueSequence < entry.EnqueueSequence, ct);

            peopleAhead = p0Ahead + p1Ahead;
        }

        // Now serving
        var nowServing = await db.QueueEntries.AsNoTracking()
            .CountAsync(q => q.BranchId == entry.BranchId
                             && q.ServiceTypeId == entry.ServiceTypeId
                             && q.State == QueueEntryState.Serving, ct);

        // Counters
        var activeCounters = await db.Counters.AsNoTracking()
            .CountAsync(c => c.BranchId == entry.BranchId && c.Mode == CounterMode.Active, ct);

        var serviceEligibleCounters = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == entry.BranchId && c.Mode == CounterMode.Active)
            .CountAsync(c => c.AllowedServices.Any(a => a.ServiceTypeId == entry.ServiceTypeId), ct);

        // Rolling avg service duration (SERVICE_LOGS before snapshotAt, last 30 days)
        var cutoff = snapshotAt.AddDays(-30);
        var rollingAvg = await db.ServiceSessionLogs.AsNoTracking()
            .Where(l => l.ServiceTypeId == entry.ServiceTypeId
                        && l.EndedAt < snapshotAt
                        && l.EndedAt >= cutoff
                        && l.DurationSeconds > 0)
            .Select(l => (double?)l.DurationSeconds / 60.0)
            .AverageAsync(ct);

        // Slot features
        double? minutesSinceSlotStart = null;
        double? minutesUntilSlotEnd = null;
        int onlineBookedInSlot = 0;
        int walkInInSlot = 0;

        if (entry.AssignedSlotStart.HasValue && entry.AssignedSlotEnd.HasValue)
        {
            minutesSinceSlotStart = Math.Max(0, (snapshotAt - entry.AssignedSlotStart.Value).TotalMinutes);
            minutesUntilSlotEnd = Math.Max(0, (entry.AssignedSlotEnd.Value - snapshotAt).TotalMinutes);

            var slotQuery = db.QueueEntries.AsNoTracking()
                .Where(q => q.BranchId == entry.BranchId
                            && q.ServiceTypeId == entry.ServiceTypeId
                            && q.State != QueueEntryState.Missed
                            && q.AssignedSlotStart == entry.AssignedSlotStart
                            && q.AssignedSlotEnd == entry.AssignedSlotEnd);

            onlineBookedInSlot = await slotQuery
                .CountAsync(q => q.EntryType == QueueEntryType.OnlineBooked, ct);
            walkInInSlot = await slotQuery
                .CountAsync(q => q.EntryType == QueueEntryType.WalkIn, ct);
        }

        return new WaitTimeFeatures
        {
            QueueLength = queueLength,
            PeopleAhead = peopleAhead,
            OnlineQueueLength = onlineQueueLength,
            WalkInQueueLength = walkInQueueLength,
            ActiveCounters = activeCounters,
            ServiceEligibleActiveCounters = serviceEligibleCounters,
            NowServing = nowServing,
            RollingAvgServiceMinutes = rollingAvg,
            DefaultAvgServiceMinutes = service.DefaultAvgServiceMinutes,
            HourOfDay = hour,
            DayOfWeek = (int)localTime.DayOfWeek,
            IsPeakHour = isPeak,
            EntryType = (int)entry.EntryType,
            CheckedIn = entry.CheckedIn,
            EnqueueSequence = entry.EnqueueSequence,
            SlotDurationMinutes = branch.SlotDurationMinutes,
            MinutesUntilSlotEnd = minutesUntilSlotEnd,
            MinutesSinceSlotStart = minutesSinceSlotStart,
            OnlineSlotsPerSlot = service.OnlineSlotsPerSlot,
            OnlineBookedInSlot = onlineBookedInSlot,
            WalkInInSlot = walkInInSlot,
            BranchCode = branch.BranchCode,
            ServiceCode = service.Code,
            TicketPrefix = string.IsNullOrEmpty(entry.TicketNumber)
                ? (service.Code.Length > 0 ? service.Code[..1].ToUpperInvariant() : "X")
                : entry.TicketNumber[..1].ToUpperInvariant(),
            PeopleAheadCallNext = peopleAhead,
            CrossLaneQueueLength = onlineQueueLength + walkInQueueLength,
            SlotActive = entry.AssignedSlotStart.HasValue && entry.AssignedSlotEnd.HasValue
                         && entry.AssignedSlotStart <= snapshotAt && entry.AssignedSlotEnd > snapshotAt ? 1 : 0,
            CallNextPriority = myIsP0 ? 0 : 1,
        };
    }

    /// <summary>
    /// Convert WaitTimeFeatures into an MlTrainingObservation (snapshot without target yet).
    /// </summary>
    public static MlTrainingObservation ToObservation(
        WaitTimeFeatures f,
        QueueEntry entry,
        DateTimeOffset snapshotAt)
    {
        return new MlTrainingObservation
        {
            Id = Guid.NewGuid(),
            QueueEntryId = entry.Id,
            BranchId = entry.BranchId,
            ServiceTypeId = entry.ServiceTypeId,
            SnapshotAt = snapshotAt,
            QueueEligibleAt = entry.QueueEligibleAt,
            ServingStartedAt = null,
            ActualWaitingMinutes = null,
            EntryType = f.EntryType,
            CheckedIn = f.CheckedIn,
            EnqueueSequence = f.EnqueueSequence,
            QueueLength = f.QueueLength,
            PeopleAhead = f.PeopleAhead,
            OnlineQueueLength = f.OnlineQueueLength,
            WalkInQueueLength = f.WalkInQueueLength,
            ActiveCounters = f.ActiveCounters,
            ServiceEligibleActiveCounters = f.ServiceEligibleActiveCounters,
            NowServing = f.NowServing,
            RollingAvgServiceMinutes = f.RollingAvgServiceMinutes,
            DefaultAvgServiceMinutes = f.DefaultAvgServiceMinutes,
            HourOfDay = f.HourOfDay,
            DayOfWeek = f.DayOfWeek,
            IsPeakHour = f.IsPeakHour,
            SlotDurationMinutes = f.SlotDurationMinutes,
            MinutesUntilSlotEnd = f.MinutesUntilSlotEnd,
            MinutesSinceSlotStart = f.MinutesSinceSlotStart,
            OnlineSlotsPerSlot = f.OnlineSlotsPerSlot,
            OnlineBookedInSlot = f.OnlineBookedInSlot,
            WalkInInSlot = f.WalkInInSlot,
            BranchCode = f.BranchCode,
            ServiceCode = f.ServiceCode,
        };
    }
}
