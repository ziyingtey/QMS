namespace QMS.Domain.Enums;

public enum BookingStatus
{
    Pending = 0,
    Confirmed = 1,
    CheckedIn = 2,
    Completed = 3,
    Cancelled = 4,
    NoShow = 5,
    /// <summary>Checked in but not called before the branch day ended. Distinct from customer-initiated Cancelled.</summary>
    Expired = 6
}
