namespace QMS.Domain.Entities;

/// <summary>
/// Snapshot-based ML training observation.
/// Features are captured at prediction time (SnapshotAt) — the moment the ticket becomes queue-eligible.
/// Target (ActualWaitingMinutes = CalledAt - QueueEligibleAt) is filled later when the ticket is called.
///
/// Walk-in: snapshot at creation (immediately eligible).
/// Online:  snapshot once checked in, at max(CheckedInAt, AssignedSlotStart - OnlineEarlyCallMinutes)
///          (same queue_eligible_at as the training simulation); QueueEligibleAt is set to that moment.
/// </summary>
public class MlTrainingObservation
{
    public Guid Id { get; set; }

    // ── Identity ──
    public Guid QueueEntryId { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public Guid? ServiceTypeId { get; set; }
    public ServiceType? ServiceType { get; set; }

    // ── Timing ──
    public DateTimeOffset SnapshotAt { get; set; }
    public DateTimeOffset? QueueEligibleAt { get; set; }
    /// <summary>When the counter called the ticket (Call Next). End point of the target.</summary>
    public DateTimeOffset? CalledAt { get; set; }
    /// <summary>Recorded for reference only (after the customer walks up); not the target end point.</summary>
    public DateTimeOffset? ServingStartedAt { get; set; }

    // ── Target (filled when the ticket is called, NULL until then) ──
    /// <summary>CalledAt - QueueEligibleAt (training simulation: counter pick time - queue_eligible_at). NULL until called.</summary>
    public double? ActualWaitingMinutes { get; set; }

    // ── Entry / Customer ──
    public int EntryType { get; set; }
    public bool CheckedIn { get; set; }
    public long EnqueueSequence { get; set; }

    // ── Queue State at SnapshotAt ──
    public int QueueLength { get; set; }
    public int PeopleAhead { get; set; }
    public int OnlineQueueLength { get; set; }
    public int WalkInQueueLength { get; set; }
    /// <summary>Queue-eligible tickets in every lane heard by the counters that serve this lane (ML feature CrossLaneQueueLength).</summary>
    public int CrossLaneQueueLength { get; set; }

    // ── Capacity at SnapshotAt ──
    public int ActiveCounters { get; set; }
    public int ServiceEligibleActiveCounters { get; set; }
    public int NowServing { get; set; }

    // ── Counter state at SnapshotAt (schema v4, migration 005) ──
    /// <summary>Listening counters (Active, serve this service) not holding a Called/Serving ticket (ML feature).</summary>
    public int? IdleListeningCounters { get; set; }
    /// <summary>Deterministic Call Next drain ETA (CounterSimulationEstimator); NULL when no Active counter serves the lane (ML feature).</summary>
    public double? CounterSimEtaMinutes { get; set; }

    // ── Historical Service Duration (from SERVICE_LOGS before SnapshotAt) ──
    public double? RollingAvgServiceMinutes { get; set; }
    public int DefaultAvgServiceMinutes { get; set; }

    // ── Time Features ──
    public int HourOfDay { get; set; }
    public int DayOfWeek { get; set; }
    public bool IsPeakHour { get; set; }

    // ── Slot / Capacity Features ──
    public int SlotDurationMinutes { get; set; }
    /// <summary>Branch.OnlineEarlyCallMinutes at snapshot time (ML feature EarlyCallMinutes).</summary>
    public int EarlyCallMinutes { get; set; }
    public double? MinutesUntilSlotEnd { get; set; }
    public double? MinutesSinceSlotStart { get; set; }
    public int OnlineSlotsPerSlot { get; set; }
    public int OnlineBookedInSlot { get; set; }
    public int WalkInInSlot { get; set; }
    /// <summary>1 if an online ticket's slot is active at SnapshotAt (always 0 for walk-ins).</summary>
    public int SlotActive { get; set; }
    /// <summary>0 = P0 (online + checked in + slot active), 1 = P1.</summary>
    public int CallNextPriority { get; set; }

    // ── Branch / Service Identity ──
    /// <summary>Stored for reference / CV ordering; not a model feature since v4.</summary>
    public int BranchCode { get; set; }
    public string ServiceCode { get; set; } = string.Empty;
    /// <summary>First letter of the ticket number (queue prefix), ML categorical feature.</summary>
    public string TicketPrefix { get; set; } = string.Empty;

    // ── Model Metadata ──
    /// <summary>
    /// "v2" = legacy rows (Sun=0 DayOfWeek, online snapshot at SlotStart, CrossLane == QueueLength,
    /// target ending at ServingStartedAt). "v3" = rows aligned with the training simulation but without the
    /// counter-state columns. "v4" = v3 + IdleListeningCounters / CounterSimEtaMinutes
    /// (see WaitTimeFeatureBuilder.FeatureSchemaVersion). Train only on v4.
    /// </summary>
    public string FeatureSchemaVersion { get; set; } = "v4";
}
