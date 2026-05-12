using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

/// <summary>Teller or branch manager: login identity and branch (no row in <see cref="Customer"/>).</summary>
public class Staff
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public StaffRoleKind Role { get; set; } = StaffRoleKind.Staff;
    public StaffPresenceStatus Status { get; set; } = StaffPresenceStatus.Active;
}
