using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

public class Counter
{
    public Guid Id { get; set; }
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public int Number { get; set; }
    public CounterMode Mode { get; set; } = CounterMode.Active;
    public Guid? StaffId { get; set; }
    public Staff? AssignedStaff { get; set; }
    /// <summary>Lecturer ERD current_service_type_id — optional dedicated lane.</summary>
    public Guid? CurrentServiceTypeId { get; set; }
    public ServiceType? CurrentServiceType { get; set; }
    /// <summary>When empty, counter is <b>General</b> and may call any service lane. Otherwise only listed lanes.</summary>
    public ICollection<CounterAllowedService> AllowedServices { get; set; } = new List<CounterAllowedService>();
}
