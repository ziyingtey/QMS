namespace QMS.Domain.Entities;

public class ServiceType
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int DefaultAvgServiceMinutes { get; set; } = 10;
    /// <summary>Lecturer ERD priority_weight for dispatch tuning hooks.</summary>
    public int PriorityWeight { get; set; } = 1;
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
    public ICollection<QueueEntry> QueueEntries { get; set; } = new List<QueueEntry>();
    public ICollection<ServiceSessionLog> ServiceLogs { get; set; } = new List<ServiceSessionLog>();
    public ICollection<CounterAllowedService> CounterCapabilities { get; set; } = new List<CounterAllowedService>();
    public ICollection<MlTrainingObservation> MlTrainingObservations { get; set; } = new List<MlTrainingObservation>();
    public ICollection<TimeSlot> TimeSlots { get; set; } = new List<TimeSlot>();
}
