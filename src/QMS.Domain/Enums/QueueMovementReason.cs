namespace QMS.Domain.Enums;

public enum QueueMovementReason
{
    /// <summary>Legacy: Pull Forward removed in multi-service redesign. Kept for existing DB records.</summary>
    [Obsolete("Pull Forward removed")] PullForwardEarlyFinish = 0,
    [Obsolete("Pull Forward removed")] PullForwardNoShow = 1,
    [Obsolete("Pull Forward removed")] PullForwardCounterActivated = 2,

    /// <summary>Customer manually rescheduled their booking to a different slot.</summary>
    ManualReschedule = 3,
}
