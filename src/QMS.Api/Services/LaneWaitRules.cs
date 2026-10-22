namespace QMS.Api.Services;

/// <summary>
/// One wait rule for every manager page, so Dashboard, Live Monitor, Service Lanes and Analytics always agree:
/// <list type="bullet">
/// <item>Wait start = <c>QueueEligibleAt ?? CreatedAt</c> (walk-in: ticket issue / transfer; online:
/// max(CheckedInAt, SlotStart - EarlyCall), the same start as the ML target). A wait ends at <c>CalledAt</c>
/// for called tickets, or "now" for tickets still waiting.</item>
/// <item>Lane = the entry's <c>QueueId</c>, falling back to its service type's <c>QueueId</c>.</item>
/// <item>Target = that lane's <c>ServiceLevelMinutes</c> (<see cref="DefaultServiceLevelMinutes"/> when no
/// lane can be resolved). A wait is "too long" when it is above the target; "within target" otherwise.</item>
/// <item>Only checked-in waiting tickets can be "too long" live: a booking that has not checked in is not
/// in the branch yet (its provisional QueueEligibleAt is the slot start).</item>
/// </list>
/// </summary>
public static class LaneWaitRules
{
    /// <summary>Target used when a ticket has no lane (same as the BranchQueue default).</summary>
    public const int DefaultServiceLevelMinutes = 15;

    public static DateTimeOffset WaitStart(DateTimeOffset? queueEligibleAt, DateTimeOffset createdAt)
        => queueEligibleAt ?? createdAt;

    /// <summary>Minutes waited so far; negative while an online ticket is not yet eligible.</summary>
    public static double MinutesWaiting(DateTimeOffset now, DateTimeOffset? queueEligibleAt, DateTimeOffset createdAt)
        => (now - WaitStart(queueEligibleAt, createdAt)).TotalMinutes;

    /// <summary>Wait of a called ticket: wait start to CalledAt (never negative).</summary>
    public static double MinutesToCall(DateTimeOffset calledAt, DateTimeOffset? queueEligibleAt, DateTimeOffset createdAt)
        => Math.Max(0, (calledAt - WaitStart(queueEligibleAt, createdAt)).TotalMinutes);

    /// <summary>Lane of an entry: its own QueueId, else the QueueId mapped to its service type.</summary>
    public static Guid? ResolveLaneId(Guid? queueId, Guid serviceTypeId, IReadOnlyDictionary<Guid, Guid> serviceQueueMap)
        => queueId ?? (serviceQueueMap.TryGetValue(serviceTypeId, out var mapped) ? mapped : null);

    /// <summary>Target minutes for an entry: its lane's ServiceLevelMinutes, else the default.</summary>
    public static int TargetMinutes(
        Guid? queueId, Guid serviceTypeId,
        IReadOnlyDictionary<Guid, Guid> serviceQueueMap, IReadOnlyDictionary<Guid, int> laneTargets)
        => ResolveLaneId(queueId, serviceTypeId, serviceQueueMap) is { } laneId
           && laneTargets.TryGetValue(laneId, out var minutes)
            ? minutes
            : DefaultServiceLevelMinutes;

    public static bool IsTooLong(double minutesWaiting, int serviceLevelMinutes)
        => minutesWaiting > serviceLevelMinutes;
}
