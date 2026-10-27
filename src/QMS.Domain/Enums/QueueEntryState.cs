namespace QMS.Domain.Enums;

public enum QueueEntryState
{
    Waiting = 0,
    Called = 1,
    Serving = 2,
    Completed = 3,
    /// <summary>Called but customer did not respond within the grace window.</summary>
    Missed = 4,
    /// <summary>Customer-initiated cancellation (distinct from Missed).</summary>
    Cancelled = 5,
    /// <summary>Online booking: slot ended without check-in (distinct from Missed/Cancelled).</summary>
    NoShow = 6
}
