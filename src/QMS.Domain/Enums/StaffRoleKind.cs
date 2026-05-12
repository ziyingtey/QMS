namespace QMS.Domain.Enums;

/// <summary>Teller vs branch manager (JWT <c>ClaimTypes.Role</c> uses this enum name).</summary>
public enum StaffRoleKind
{
    Staff = 0,
    Manager = 1
}
