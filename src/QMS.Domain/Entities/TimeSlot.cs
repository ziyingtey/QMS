using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

/// <summary>Lecturer ERD TIME_SLOTS — persisted capacity window per branch/lane.</summary>
public class TimeSlot
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public Guid ServiceTypeId { get; set; }
    public ServiceType ServiceType { get; set; } = null!;
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset EndTime { get; set; }
    public int TotalCapacity { get; set; }
    public int OnlineQuota { get; set; }
    public int WalkInQuota { get; set; }
    public int BookedOnline { get; set; }
    public int BookedWalkin { get; set; }
    public TimeSlotWindowStatus Status { get; set; } = TimeSlotWindowStatus.Open;
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
