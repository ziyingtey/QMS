using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

public class Counter
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public int Number { get; set; }
    public CounterMode Mode { get; set; } = CounterMode.Closed;
    public Guid? StaffId { get; set; }
    public Staff? AssignedStaff { get; set; }
    /// <summary>Lecturer ERD current_service_type_id — optional dedicated lane.</summary>
    public Guid? CurrentServiceTypeId { get; set; }
    public ServiceType? CurrentServiceType { get; set; }
    /// <summary>Allowed service lanes for this counter. Empty means the counter cannot serve any lane until the manager assigns at least one (no catch-all General mode).</summary>
    public ICollection<CounterAllowedService> AllowedServices { get; set; } = new List<CounterAllowedService>();
}
