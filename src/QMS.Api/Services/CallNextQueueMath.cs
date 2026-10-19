using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// Single source of truth for "who is ahead of me" across shared counters. Used by the customer queue
/// status (People Ahead / "You are next"), the ML feature PeopleAheadCallNext + CrossLaneQueueLength
/// (WaitTimeFeatureBuilder) and mirrored exactly by ml/generate_seed_data.py + the notebook.
///
/// Listening counters: Active counters that can serve my service (<see cref="CounterCanServeLane"/>; a counter
/// with no AllowedServices serves nothing). Heard lanes S: union of their AllowedServices (includes my own
/// service). If no Active counter serves my service, S = { my service }. S is used for CrossLaneQueueLength.
///
/// Eligible ahead of me: tickets of the same branch, ServiceDay = branch-local day of <c>at</c>, State Waiting,
/// Call Next eligible at <c>at</c> (walk-in: checked in and created; online: checked in and
/// SlotStart - OnlineEarlyCallMinutes &lt;= at), that Call Next would pick before me by
/// <see cref="QueueCallNextSelector.CompareCallOrder"/> (CreatedAt, then Id). I am never counted.
///
/// People Ahead: for each listening counter, count the eligible-ahead tickets in THAT counter's AllowedServices;
/// People Ahead = the MINIMUM over those counters (the counter that will reach me first). If no Active counter
/// serves my service, count same-service eligible-ahead tickets only. Since every counter's set is a subset of
/// S, People Ahead &lt;= CrossLaneQueueLength always holds.
///
/// Example 1: counter1 {A,B}; queue A001 9:00, A002 9:10, A003 9:11, B001 9:12. B001 has 3 ahead (counter1
/// sees A001, A002, A003). When counter2 {B} opens, B001 has min(3, 0) = 0 ahead; A003 still has 2.
/// Example 2: counter1 {A,B}, counter2 {B,C}, counter3 {D}; queue B001 9:00, C001 9:02, B002 9:04,
/// A001 9:06, D001 9:08. A001: counter1 -> 2 (B001, B002). C001: counter2 -> 1 (B001).
/// B002: min(counter1 = 1, counter2 = 2) = 1. D001: counter3 -> 0.
/// </summary>
public static class CallNextQueueMath
{
    /// <summary>
    /// Active counters, the ones listening to my service, the heard lane set S (union, used for
    /// CrossLaneQueueLength) and, per listening counter, its own service set (used for People Ahead).
    /// </summary>
    public sealed record HeardLanes(
        IReadOnlyList<Counter> ActiveCounters,
        IReadOnlyList<Counter> ListeningCounters,
        IReadOnlyList<Guid> HeardServiceIds,
        IReadOnlyList<IReadOnlySet<Guid>> ListeningServiceSets,
        Guid MyServiceId);

    /// <summary>Same rule as QmsQueueService.CounterCanServeLane (no AllowedServices = cannot serve anything).</summary>
    public static bool CounterCanServeLane(Counter counter, Guid serviceTypeId) =>
        counter.AllowedServices.Count > 0 && counter.AllowedServices.Any(a => a.ServiceTypeId == serviceTypeId);

    public static async Task<HeardLanes> ResolveHeardLanesAsync(
        QmsDbContext db, Guid branchId, Guid serviceTypeId, CancellationToken ct = default)
    {
        var active = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == branchId && c.Mode == CounterMode.Active)
            .ToListAsync(ct);
        var listening = active.Where(c => CounterCanServeLane(c, serviceTypeId)).ToList();
        var heard = listening
            .SelectMany(c => c.AllowedServices.Select(a => a.ServiceTypeId))
            .Distinct()
            .ToList();
        if (heard.Count == 0)
            heard.Add(serviceTypeId); // no Active counter serves my lane: fall back to same-service only
        var serviceSets = listening
            .Select(c => (IReadOnlySet<Guid>)c.AllowedServices.Select(a => a.ServiceTypeId).ToHashSet())
            .ToList();
        return new HeardLanes(active, listening, heard, serviceSets, serviceTypeId);
    }

    /// <summary>Branch-local calendar day of <paramref name="at"/> (matches QueueEntry.ServiceDay).</summary>
    public static DateOnly BranchDay(Branch branch, DateTimeOffset at) =>
        DateOnly.FromDateTime(at.ToOffset(TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes)).DateTime);

    /// <summary>
    /// Waiting tickets of the branch for <paramref name="serviceDay"/> that are Call Next eligible at
    /// <paramref name="at"/>. Same rule as FindAndClaimNextTicketAsync / CounterSimulationEstimator.
    /// </summary>
    public static IQueryable<QueueEntry> EligibleWaiting(
        IQueryable<QueueEntry> source, Guid branchId, DateOnly serviceDay, DateTimeOffset at, int earlyCallMinutes)
    {
        // "SlotStart - EarlyCall <= at" rewritten as "SlotStart <= at + EarlyCall" for SQL translation.
        var earlyCallCutoff = at.AddMinutes(earlyCallMinutes);
        return source
            .Where(q => q.BranchId == branchId
                        && q.State == QueueEntryState.Waiting
                        && q.ServiceDay == serviceDay)
            .Where(q =>
                (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn && q.CreatedAt <= at)
                || (q.EntryType == QueueEntryType.OnlineBooked
                    && q.CheckedIn
                    && q.AssignedSlotStart.HasValue
                    && q.AssignedSlotStart.Value <= earlyCallCutoff));
    }

    /// <summary>
    /// People ahead of <paramref name="me"/> (see class summary): minimum over the listening counters of the
    /// eligible tickets in that counter's services that Call Next would pick before me; same-service only when
    /// no Active counter serves my service.
    /// </summary>
    public static async Task<int> CountPeopleAheadAsync(
        QmsDbContext db, QueueEntry me, HeardLanes lanes,
        DateOnly serviceDay, DateTimeOffset at, int earlyCallMinutes, CancellationToken ct = default)
    {
        var ids = lanes.HeardServiceIds.ToList();
        var myCreatedAt = me.CreatedAt;
        var myId = me.Id;
        // One SQL query: candidates in S with CreatedAt <= mine. Order in memory with the selector's own comparer
        // so the Id tiebreak uses exactly the .NET Guid ordering Call Next uses (SQL Server orders GUIDs differently).
        var candidates = await EligibleWaiting(db.QueueEntries.AsNoTracking(), me.BranchId, serviceDay, at, earlyCallMinutes)
            .Where(q => ids.Contains(q.ServiceTypeId) && q.Id != myId && q.CreatedAt <= myCreatedAt)
            .Select(q => new { q.Id, q.ServiceTypeId, q.CreatedAt })
            .ToListAsync(ct);
        var aheadServiceIds = candidates
            .Where(c => QueueCallNextSelector.CompareCallOrder(c.CreatedAt, c.Id, myCreatedAt, myId) < 0)
            .Select(c => c.ServiceTypeId)
            .ToList();

        // No Active counter serves my service: fall back to same-service tickets only.
        if (lanes.ListeningServiceSets.Count == 0)
            return aheadServiceIds.Count(s => s == lanes.MyServiceId);

        // Per listening counter: tickets in that counter's services ahead of me; take the minimum.
        return lanes.ListeningServiceSets.Min(set => aheadServiceIds.Count(set.Contains));
    }

    /// <summary>Convenience overload: resolves the listening counters and the branch day, then counts.</summary>
    public static async Task<int> CountPeopleAheadAsync(
        QmsDbContext db, QueueEntry me, Branch branch, DateTimeOffset at, CancellationToken ct = default)
    {
        var lanes = await ResolveHeardLanesAsync(db, me.BranchId, me.ServiceTypeId, ct);
        return await CountPeopleAheadAsync(
            db, me, lanes, BranchDay(branch, at), at, branch.OnlineEarlyCallMinutes, ct);
    }
}
