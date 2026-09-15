namespace QMS.Domain.Enums;

public enum QueueMovementReason
{
    /// <summary>Slot finished early, walk-in pulled from a later slot.</summary>
    PullForwardEarlyFinish = 0,

    /// <summary>No-show freed a seat, walk-in pulled from a later slot.</summary>
    PullForwardNoShow = 1,

    /// <summary>Counter activated, increased capacity triggers walk-in pull forward.</summary>
    PullForwardCounterActivated = 2,

    /// <summary>Customer manually rescheduled their booking to a different slot.</summary>
    ManualReschedule = 3,
}
