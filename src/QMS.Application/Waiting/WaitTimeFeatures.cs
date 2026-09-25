namespace QMS.Application.Waiting;

/// <summary>
/// Unified feature object for wait-time prediction.
/// Used by both Formula estimator and future ML/ONNX estimator.
/// All values represent state at a specific prediction moment.
/// </summary>
public sealed record WaitTimeFeatures
{
    // ── Queue State ──
    public int QueueLength { get; init; }
    public int PeopleAhead { get; init; }
    public int OnlineQueueLength { get; init; }
    public int WalkInQueueLength { get; init; }

    // ── Capacity ──
    public int ActiveCounters { get; init; }
    public int ServiceEligibleActiveCounters { get; init; }
    public int NowServing { get; init; }

    // ── Service Duration ──
    public double? RollingAvgServiceMinutes { get; init; }
    public int DefaultAvgServiceMinutes { get; init; }

    // ── Time ──
    public int HourOfDay { get; init; }
    public int DayOfWeek { get; init; }
    public bool IsPeakHour { get; init; }

    // ── Entry ──
    public int EntryType { get; init; }
    public bool CheckedIn { get; init; }
    public long EnqueueSequence { get; init; }

    // ── Slot ──
    public int SlotDurationMinutes { get; init; }
    public double? MinutesUntilSlotEnd { get; init; }
    public double? MinutesSinceSlotStart { get; init; }
    public int OnlineSlotsPerSlot { get; init; }
    public int OnlineBookedInSlot { get; init; }
    public int WalkInInSlot { get; init; }

    // ── Identity ──
    public int BranchCode { get; init; }
    public string ServiceCode { get; init; } = string.Empty;
    /// <summary>First letter of ticket number (A/B/…); used by Tier-B ML model.</summary>
    public string TicketPrefix { get; init; } = string.Empty;

    // ── Tier-B ML bridges (optional; estimator derives defaults when null) ──
    public int? CrossLaneQueueLength { get; init; }
    public int? PeopleAheadCallNext { get; init; }
    public int? SlotActive { get; init; }
    public int? CallNextPriority { get; init; }

    /// <summary>Best available average service duration (rolling if available, else default).</summary>
    public double EffectiveAvgServiceMinutes => RollingAvgServiceMinutes ?? DefaultAvgServiceMinutes;
}
