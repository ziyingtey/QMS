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
    /// "v4" = v3 + IdleListeningCounters and CounterSimEtaMinutes stored in the row (migration 005), so SQL
    /// retraining gets every model feature; train_wait_model.py reads only v4 rows.
    /// </summary>
    public const string FeatureSchemaVersion = "v4";

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

        // Queue counts only include tickets that are already queue-eligible at the snapshot (training:
        // queue_eligible_at <= snap_time, not yet picked). Rule shared with Call Next via CallNextQueueMath:
        // walk-in = checked in (and already created); online = checked in AND SlotStart - EarlyCall <= snapshotAt.
        var eligibleWaiting = CallNextQueueMath.EligibleWaiting(
            db.QueueEntries.AsNoTracking(), entry.BranchId, snapshotDay, snapshotAt, earlyCallMinutes);

        // Heard lanes S (union of AllowedServices of Active counters that serve my lane; S = {me} if none).
        var lanes = await CallNextQueueMath.ResolveHeardLanesAsync(db, entry.BranchId, entry.ServiceTypeId, ct);

        var sameServiceEligible = eligibleWaiting.Where(q => q.ServiceTypeId == entry.ServiceTypeId);

        var queueLength = await sameServiceEligible.CountAsync(ct);
        var onlineQueueLength = await sameServiceEligible
            .CountAsync(q => q.EntryType == QueueEntryType.OnlineBooked, ct);
        var walkInQueueLength = queueLength - onlineQueueLength;

        // People ahead (PeopleAhead / PeopleAheadCallNext): per listening counter, eligible tickets in THAT
        // counter's services that Call Next would pick before me (CreatedAt, then Id); minimum over the counters
        // (same-service only if no Active counter serves my lane). Same helper as the customer queue status and
        // the same definition as people_ahead in the training simulation.
        var peopleAhead = await CallNextQueueMath.CountPeopleAheadAsync(
            db, entry, lanes, snapshotDay, snapshotAt, earlyCallMinutes, ct);

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
        var activeCounters = lanes.ActiveCounters.Count;
        var serviceEligibleCounters = lanes.ListeningCounters.Count;

        // CrossLaneQueueLength: queue-eligible, not-yet-called tickets in all lanes of S (training: heard_prefixes).
        // Example: counter 1 serves {DEPOSIT, WITHDRAW}; 3 eligible DEPOSIT + 4 eligible WITHDRAW -> 7.
        // If no Active counter serves my lane, S = {my lane} (same fallback as People Ahead). Every listening
        // counter's service set is a subset of S, so PeopleAheadCallNext <= CrossLaneQueueLength always holds.
        var heardServiceIds = lanes.HeardServiceIds.ToList();
        var crossLaneQueueLength = await eligibleWaiting.CountAsync(q => heardServiceIds.Contains(q.ServiceTypeId), ct);

        // RollingAvgServiceMinutes: shared RollingServiceAverage rule (same as training and
        // CounterSimulationEstimator): mean of the last 30 completed services with EndedAt <= snapshot, ignoring
        // durations < 30 s; fewer than 5 valid -> DefaultAvgServiceMinutes. Rounded to 2 dp like training.
        // Was: every log > 0 s, so a few seconds-long test services sent 0.03 min for a 15-min service.
        // Prefix = queue in production (BranchQueue.TicketPrefix), so pool services that share this queue.
        var rollingServiceIds = service.QueueId is { } queueId
            ? await db.ServiceTypes.AsNoTracking()
                .Where(s => s.QueueId == queueId)
                .Select(s => s.Id)
                .ToListAsync(ct)
            : new List<Guid>();
        if (!rollingServiceIds.Contains(entry.ServiceTypeId))
            rollingServiceIds.Add(entry.ServiceTypeId);
        double rollingAvg = Math.Round(
            await RollingServiceAverage.MinutesAsync(db, rollingServiceIds, snapshotAt, service.DefaultAvgServiceMinutes, ct), 2);

        // IdleListeningCounters: listening counters (Active, serve my service) not holding a Called/Serving ticket.
        // Training: listening counters with no ticket in service at snap time. Lets the model tell
        // "0 ahead + idle counter" (wait ~0) from "0 ahead + counter busy with another service".
        var busyCounterIds = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == entry.BranchId
                        && (q.State == QueueEntryState.Called || q.State == QueueEntryState.Serving)
                        && q.CounterId != null)
            .Select(q => q.CounterId!.Value)
            .Distinct()
            .ToListAsync(ct);
        var idleListeningCounters = lanes.ListeningCounters.Count(c => !busyCounterIds.Contains(c.Id));

        // CounterSimEtaMinutes: the deterministic Call Next drain (CounterSimulationEstimator, same code as the
        // display fallback), mirrored by counter_sim_eta in training. No Active counter serves me -> null (NaN).
        var simEta = await new CounterSimulationEstimator(db).EstimateAsync(entry, earlyCallMinutes, snapshotAt, ct);
        double? counterSimEta = double.IsInfinity(simEta) || double.IsNaN(simEta) ? null : Math.Round(simEta, 2);

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
            // Walk-ins in my slot bucket (AssignedSlotStart/End = the slot they arrived in); training counts the
            // same (simulated walk-ins get the bucket too; previously always 0 there).
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
            IdleListeningCounters = idleListeningCounters,
            CounterSimEtaMinutes = counterSimEta,
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
            IdleListeningCounters = f.IdleListeningCounters,
            CounterSimEtaMinutes = f.CounterSimEtaMinutes,
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
