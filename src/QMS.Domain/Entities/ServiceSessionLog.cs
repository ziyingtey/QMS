namespace QMS.Domain.Entities;

/// <summary>Feeds analytics / ML; maps conceptually to BDS_QMS_AUDIT service timings.</summary>
public class ServiceSessionLog
{
    public Guid Id { get; set; }
    public Guid ServiceTypeId { get; set; }
    public ServiceType ServiceType { get; set; } = null!;
    public Guid? StaffId { get; set; }
    public Guid? CounterId { get; set; }
    public string TicketNumber { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset EndedAt { get; set; }
    public int DurationSeconds { get; set; }
}
