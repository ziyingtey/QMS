namespace QMS.Domain.Enums;

/// <summary>Channel into the unified queue (not a separate physical queue).</summary>
public enum QueueEntryType
{
    OnlineBooked = 0,
    WalkIn = 1,
    LateDegraded = 2
}
