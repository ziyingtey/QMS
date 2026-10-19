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
    /// Schema version written to ML_TRAINING_DATA.FeatureSchemaVersion. "v3" = features/target aligned with
    /// ml/generate_seed_data.py + notebook (Mon=0 DayOfWeek, queue-eligible counts, cross-lane, per-branch-day
    /// EnqueueSequence, online snapshot at max(CheckedInAt, SlotStart - EarlyCall), target = CalledAt - QueueEligibleAt).
    /// Older rows keep the column default "v2" and must not be used for training.
    /// </summary>
    public const string FeatureSchemaVersion = "v3";

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

        // FIX (DayOfWeek): training uses Python weekday() (Mon=0..Sun=6); .NET DayOfWeek is Sun=0..Sat=6.
        // Convert so e.g. Monday is 0 (was 1) and Sunday is 6 (was 0).
        var dayOfWeekMon0 = ((int)localTime.DayOfWeek + 6) % 7;

        var snapshotDay = DateOnly.FromDateTime(localTime.DateTime);
        var earlyCallMinutes = branch.OnlineEarlyCallMinutes;
        // Online eligibility "SlotStart - EarlyCall <= snapshotAt" rewritten as "SlotStart <= snapshotAt + EarlyCall".
        var earlyCallCutoff = snapshotAt.AddMinutes(earlyCallMinutes);

        // Today's Waiting tickets at this branch (by ServiceDay; future-day bookings excluded).
        var todayWaiting = db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == entry.BranchId
                        && q.State == QueueEntryState.Waiting
                        && q.ServiceDay == snapshotDay);

        // FIX (queue counts): training counts only tickets that are already queue-eligible at the snapshot
        // (queue_eligible_at <= snap_time, not yet served). Same eligibility rule as Call Next /
        // CounterSimulationEstimator: walk-in = checked in (and already created); online = checked in AND
        // SlotStart - OnlineEarlyCallMinutes <= snapshotAt. Previously every Waiting ticket for today was
        // counted, so online bookings for later slots today inflated QueueLength.
        var eligibleWaiting = todayWaiting.Where(q =>
            (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn && q.CreatedAt <= snapshotAt)
            || (q.EntryType == QueueEntryType.OnlineBooked
                && q.CheckedIn
                && q.AssignedSlotStart.HasValue
                && q.AssignedSlotStart.Value <= earlyCallCutoff));

        var sameServiceEligible = eligibleWaiting.Where(q => q.ServiceTypeId == entry.ServiceTypeId);

        var queueLength = await sameServiceEligible.CountAsync(ct);
        var onlineQueueLength = await sameServiceEligible
            .CountAsync(q => q.EntryType == QueueEntryType.OnlineBooked, ct);
        var walkInQueueLength = queueLength - onlineQueueLength;

        // People ahead: match Call Next's CreatedAt FIFO ordering exactly.
        // QueueCallNextSelector picks earliest CreatedAt (then Id tiebreak),
        // so PeopleAhead = count of eligible tickets that Call Next would pick before this one.
        var peopleAhead = await sameServiceEligible
            .CountAsync(q => q.CreatedAt < entry.CreatedAt
                || (q.CreatedAt == entry.CreatedAt && q.Id.CompareTo(entry.Id) < 0), ct);

        var isOnline = entry.EntryType == QueueEntryType.OnlineBooked;

        // FIX (EnqueueSequence): training numbers tickets per branch per day across ALL services, in CreatedAt
        // order (online = booking time, walk-in = take-number time). QueueEntry.EnqueueSequence is per queue,
        // so it is only the ticket number. Here: 1 + tickets of this branch and ServiceDay (any service, any
        // state) created before this one (Id tiebreak, as in Call Next).
        // Example: D001 (07:50 booking), W001 (09:31), D002 (09:35) -> 1, 2, 3 (per-queue would give 1, 1, 2).
        var branchDaySequence = 1 + await db.QueueEntries.AsNoTracking()
            .CountAsync(q => q.BranchId == entry.BranchId
                             && q.ServiceDay == entry.ServiceDay
                             && q.Id != entry.Id
                             && (q.CreatedAt < entry.CreatedAt
                                 || (q.CreatedAt == entry.CreatedAt && q.Id.CompareTo(entry.Id) < 0)), ct);

        // P0/P1 kept as an independent ML feature (CallNextPriority) — not used for ordering.
        var myIsP0 = isOnline && entry.CheckedIn
                     && entry.AssignedSlotStart.HasValue && entry.AssignedSlotStart <= snapshotAt
                     && entry.AssignedSlotEnd.HasValue && entry.AssignedSlotEnd > snapshotAt;

        // FIX (NowServing): training counts tickets of this service whose counter is busy at snap time
        // (counter picked them and service not finished). Live: Called (counter claimed, customer walking up)
        // + Serving, restricted to today's ServiceDay so stale rows from earlier days are not counted.
        var nowServing = await db.QueueEntries.AsNoTracking()
            .CountAsync(q => q.BranchId == entry.BranchId
                             && q.ServiceTypeId == entry.ServiceTypeId
                             && q.ServiceDay == snapshotDay
                             && (q.State == QueueEntryState.Serving || q.State == QueueEntryState.Called), ct);

        // Counters: training uses all counters working that day (= Active here) and their allowed lanes.
        var activeCounterList = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == entry.BranchId && c.Mode == CounterMode.Active)
            .ToListAsync(ct);
        var activeCounters = activeCounterList.Count;

        // Same rule as QmsQueueService.CounterCanServeLane (no AllowedServices = cannot serve anything).
        var listeningCounterList = activeCounterList
            .Where(c => c.AllowedServices.Count > 0
                        && c.AllowedServices.Any(a => a.ServiceTypeId == entry.ServiceTypeId))
            .ToList();
        var serviceEligibleCounters = listeningCounterList.Count;

        // FIX (CrossLaneQueueLength): previously online + walk-in of the SAME service (always == QueueLength).
        // Training (generate_seed_data.py / notebook): take the counters that can serve my lane, union every
        // lane those counters handle, and count queue-eligible, not-yet-served tickets in all those lanes.
        // Example: counter 1 serves {DEPOSIT, WITHDRAW}; 3 eligible DEPOSIT + 4 eligible WITHDRAW.
        //   Before: CrossLane = 3.  After: CrossLane = 7.
        var heardServiceIds = listeningCounterList
            .SelectMany(c => c.AllowedServices.Select(a => a.ServiceTypeId))
            .Distinct()
            .ToList();
        var crossLaneQueueLength = heardServiceIds.Count == 0
            ? 0
            : await eligibleWaiting.CountAsync(q => heardServiceIds.Contains(q.ServiceTypeId), ct);

        // FIX (RollingAvgServiceMinutes): training = mean of the LAST 30 completed services for the ticket
        // prefix with completion <= snap_time, rounded to 2 dp, and never missing (history is pre-seeded
        // around the service's default avg). Previously: average over the last 30 DAYS for this service only,
        // and null (-> NaN in the sidecar) when empty.
        // Prefix = queue in production (BranchQueue.TicketPrefix), so pool services that share this queue.
        var rollingServiceIds = service.QueueId is { } queueId
            ? await db.ServiceTypes.AsNoTracking()
                .Where(s => s.QueueId == queueId)
                .Select(s => s.Id)
                .ToListAsync(ct)
            : new List<Guid>();
        if (!rollingServiceIds.Contains(entry.ServiceTypeId))
            rollingServiceIds.Add(entry.ServiceTypeId);

        var recentDurations = await db.ServiceSessionLogs.AsNoTracking()
            .Where(l => rollingServiceIds.Contains(l.ServiceTypeId)
                        && l.EndedAt <= snapshotAt
                        && l.DurationSeconds > 0)
            .OrderByDescending(l => l.EndedAt)
            .Take(30)
            .Select(l => l.DurationSeconds)
            .ToListAsync(ct);
        // Empty history: fall back to the service default (the simulation seeds its history around avg_min,
        // so the model never saw NaN for this feature on bank rows).
        double rollingAvg = recentDurations.Count > 0
            ? Math.Round(recentDurations.Average() / 60.0, 2)
            : service.DefaultAvgServiceMinutes;

        // Slot features
        double? minutesSinceSlotStart = null;
        double? minutesUntilSlotEnd = null;
        int onlineBookedInSlot = 0;
        int walkInInSlot = 0;
        int slotActive = 0;

        // FIX (walk-in slot features): walk-ins get an AssignedSlotStart/End bucket in production, but in
        // training walk-ins have no slot: MinutesSince/UntilSlot = NaN, SlotActive = 0, *InSlot = 0.
        // Before: walk-in at 10:10 in the 10:00-10:30 bucket sent MinutesSinceSlotStart=10, SlotActive=1.
        // After: MinutesSinceSlotStart=null (omitted -> NaN), SlotActive=0, OnlineBookedInSlot=0, WalkInInSlot=0.
        if (isOnline && entry.AssignedSlotStart.HasValue && entry.AssignedSlotEnd.HasValue)
        {
            minutesSinceSlotStart = Math.Max(0, (snapshotAt - entry.AssignedSlotStart.Value).TotalMinutes);
            minutesUntilSlotEnd = Math.Max(0, (entry.AssignedSlotEnd.Value - snapshotAt).TotalMinutes);
            slotActive = entry.AssignedSlotStart <= snapshotAt && entry.AssignedSlotEnd > snapshotAt ? 1 : 0;

            var slotQuery = db.QueueEntries.AsNoTracking()
                .Where(q => q.BranchId == entry.BranchId
                            && q.ServiceTypeId == entry.ServiceTypeId
                            && q.State != QueueEntryState.Missed
                            && q.AssignedSlotStart == entry.AssignedSlotStart
                            && q.AssignedSlotEnd == entry.AssignedSlotEnd);

            onlineBookedInSlot = await slotQuery
                .CountAsync(q => q.EntryType == QueueEntryType.OnlineBooked, ct);
            // NOTE: training's WalkInInSlot is always 0 (simulated walk-ins have no slot), so the model
            // cannot use this value; kept as the real count for future retraining on ML_TRAINING_DATA.
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
            DayOfWeek = dayOfWeekMon0,
            IsPeakHour = isPeak,
            EntryType = (int)entry.EntryType,
            CheckedIn = entry.CheckedIn,
            EnqueueSequence = branchDaySequence,
            SlotDurationMinutes = branch.SlotDurationMinutes,
            EarlyCallMinutes = branch.OnlineEarlyCallMinutes,
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
            CrossLaneQueueLength = crossLaneQueueLength,
            SlotActive = slotActive,
            CallNextPriority = myIsP0 ? 0 : 1,
        };
    }

    /// <summary>
    /// Convert WaitTimeFeatures into an MlTrainingObservation (snapshot without target yet).
    /// </summary>
    /// <param name="queueEligibleAt">
    /// Override for the observation's QueueEligibleAt (the target origin). Online snapshots pass
    /// max(CheckedInAt, SlotStart - EarlyCall) to match training; null keeps entry.QueueEligibleAt.
    /// </param>
    public static MlTrainingObservation ToObservation(
        WaitTimeFeatures f,
        QueueEntry entry,
        DateTimeOffset snapshotAt,
        DateTimeOffset? queueEligibleAt = null)
    {
        return new MlTrainingObservation
        {
            Id = Guid.NewGuid(),
            QueueEntryId = entry.Id,
            BranchId = entry.BranchId,
            ServiceTypeId = entry.ServiceTypeId,
            SnapshotAt = snapshotAt,
            QueueEligibleAt = queueEligibleAt ?? entry.QueueEligibleAt,
            ServingStartedAt = null,
            ActualWaitingMinutes = null,
            EntryType = f.EntryType,
            CheckedIn = f.CheckedIn,
            EnqueueSequence = f.EnqueueSequence,
            QueueLength = f.QueueLength,
            PeopleAhead = f.PeopleAhead,
            OnlineQueueLength = f.OnlineQueueLength,
            WalkInQueueLength = f.WalkInQueueLength,
            CrossLaneQueueLength = f.CrossLaneQueueLength ?? (f.OnlineQueueLength + f.WalkInQueueLength),
            ActiveCounters = f.ActiveCounters,
            ServiceEligibleActiveCounters = f.ServiceEligibleActiveCounters,
            NowServing = f.NowServing,
            RollingAvgServiceMinutes = f.RollingAvgServiceMinutes,
            DefaultAvgServiceMinutes = f.DefaultAvgServiceMinutes,
            HourOfDay = f.HourOfDay,
            DayOfWeek = f.DayOfWeek,
            IsPeakHour = f.IsPeakHour,
            SlotDurationMinutes = f.SlotDurationMinutes,
            EarlyCallMinutes = f.EarlyCallMinutes,
            MinutesUntilSlotEnd = f.MinutesUntilSlotEnd,
            MinutesSinceSlotStart = f.MinutesSinceSlotStart,
            OnlineSlotsPerSlot = f.OnlineSlotsPerSlot,
            OnlineBookedInSlot = f.OnlineBookedInSlot,
            WalkInInSlot = f.WalkInInSlot,
            SlotActive = f.SlotActive ?? 0,
            CallNextPriority = f.CallNextPriority ?? 1,
            BranchCode = f.BranchCode,
            ServiceCode = f.ServiceCode,
            TicketPrefix = f.TicketPrefix,
            FeatureSchemaVersion = FeatureSchemaVersion,
        };
    }
}
