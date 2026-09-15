namespace QMS.Domain.Entities;

/// <summary>
/// Snapshot-based ML training observation.
/// Features are captured at prediction time (SnapshotAt) — the moment the ticket becomes queue-eligible.
/// Target (ActualWaitingMinutes) is filled later when ServingStartedAt is known.
///
/// Walk-in: snapshot at creation (immediately eligible).
/// Online:  snapshot when AssignedSlotStart arrives (slot begins).
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
    public DateTimeOffset? InitialQueueEligibleAt { get; set; }
    public DateTimeOffset? ServingStartedAt { get; set; }

    // ── Target (filled when Serving starts, NULL until then) ──
    /// <summary>ServingStartedAt - InitialQueueEligibleAt. NULL until customer starts being served.</summary>
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

    // ── Capacity at SnapshotAt ──
    public int ActiveCounters { get; set; }
    public int ServiceEligibleActiveCounters { get; set; }
    public int NowServing { get; set; }

    // ── Historical Service Duration (from SERVICE_LOGS before SnapshotAt) ──
    public double? RollingAvgServiceMinutes { get; set; }
    public int DefaultAvgServiceMinutes { get; set; }

    // ── Time Features ──
    public int HourOfDay { get; set; }
    public int DayOfWeek { get; set; }
    public bool IsPeakHour { get; set; }

    // ── Slot / Capacity Features ──
    public int SlotDurationMinutes { get; set; }
    public double? MinutesUntilSlotEnd { get; set; }
    public double? MinutesSinceSlotStart { get; set; }
    public int OnlineQuotaPercent { get; set; }
    public int OnlineBookedInSlot { get; set; }
    public int WalkInInSlot { get; set; }

    // ── Pull Forward State (at snapshot time only — never updated after) ──
    public bool WasPulledForward { get; set; }
    public int PullForwardCount { get; set; }

    // ── Branch / Service Identity ──
    public int BranchCode { get; set; }
    public string ServiceCode { get; set; } = string.Empty;

    // ── Model Metadata ──
    public string FeatureSchemaVersion { get; set; } = "v2";
}
