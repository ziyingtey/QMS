namespace QMS.Domain.Entities;

public class MlTrainingObservation
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public Guid? ServiceTypeId { get; set; }
    public ServiceType? ServiceType { get; set; }
    public int QueueLength { get; set; }
    public int ActiveCounters { get; set; }
    public double WaitingMinutes { get; set; }
    public double ServiceDurationMinutes { get; set; }
    public int HourOfDay { get; set; }
    public bool IsPeakHour { get; set; }
    public DateTimeOffset SourceEventAt { get; set; } = DateTimeOffset.UtcNow;
}
