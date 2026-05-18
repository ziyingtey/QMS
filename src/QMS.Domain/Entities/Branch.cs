using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

public class Branch
{
    public Guid Id { get; set; }
    /// <summary>Numeric code compatible with legacy BRANCH_CD where applicable.</summary>
    public int BranchCode { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>Human-readable address for customer UI (distances still use Latitude/Longitude).</summary>
    public string Address { get; set; } = string.Empty;
    /// <summary>State / federal territory (e.g. for customer map filters, aligned with MY state lists).</summary>
    public string State { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    /// <summary>Percent of slot capacity reserved for online booking (e.g. 70).</summary>
    public int OnlineQuotaPercent { get; set; } = 70;
    public int SlotDurationMinutes { get; set; } = 30;
    public int GeofenceMeters { get; set; } = 80;
    /// <summary>Fixed offset from UTC for interpreting calendar dates (e.g. 480 = Singapore UTC+8).</summary>
    public int ServiceZoneOffsetMinutes { get; set; } = 8 * 60;
    /// <summary>Lecturer ERD branch status (open/closed).</summary>
    public BranchOpeningStatus OpeningStatus { get; set; } = BranchOpeningStatus.Open;
    /// <summary>Lecturer ERD operating_hours (free-text label).</summary>
    public string? OperatingHours { get; set; }
    /// <summary>Optional hero/thumbnail URL for customer apps (HTTPS).</summary>
    public string? ImageUrl { get; set; }
    /// <summary>Lecturer ERD max_capacity (optional headline).</summary>
    public int? MaxCapacity { get; set; }
    /// <summary>When true, manager insights flag when active online bookings exceed computed online seat caps (counter-driven).</summary>
    public bool AdaptiveSlotCapacityEnabled { get; set; } = true;
    /// <summary>Optional floor for total customers per slot when adaptive capacity runs (null = no extra floor beyond engine output).</summary>
    public int? MinSlotTotalCapacity { get; set; }
    /// <summary>Unchecked online bookings may enter the call pool this many minutes before <c>SlotStart</c> (0 = only at or after slot start).</summary>
    public int OnlineEarlyCallMinutes { get; set; } = 10;
    /// <summary>After <see cref="QueueEntryState.Called"/>, if the customer does not start service within this many minutes, mark absent / no-show.</summary>
    public int CalledAbsentGraceMinutes { get; set; } = 5;
    public ICollection<Staff> StaffMembers { get; set; } = new List<Staff>();
    public ICollection<BranchOperatingHour> OperatingHoursSchedule { get; set; } = new List<BranchOperatingHour>();
    public ICollection<Counter> Counters { get; set; } = new List<Counter>();
    public ICollection<ServiceType> Services { get; set; } = new List<ServiceType>();
    public ICollection<AnalyticsSummary> AnalyticsSummaries { get; set; } = new List<AnalyticsSummary>();
    public ICollection<MlTrainingObservation> MlTrainingObservations { get; set; } = new List<MlTrainingObservation>();
}
