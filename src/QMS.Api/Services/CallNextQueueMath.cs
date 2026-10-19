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
/// Heard lanes S: union of AllowedServices of every Active counter that can serve my service (this
/// includes my own service). If no Active counter serves my service, S = { my service }.
///
/// Cross-lane people ahead: tickets of the same branch with ServiceTypeId in S, ServiceDay = branch-local
/// day of <c>at</c>, State Waiting, Call Next eligible at <c>at</c> (walk-in: checked in and created;
/// online: checked in and SlotStart - OnlineEarlyCallMinutes &lt;= at), that Call Next would pick before me
/// by <see cref="QueueCallNextSelector.CompareCallOrder"/> (CreatedAt, then Id). I am never counted.
///
/// Example: counter1 {A,B}, counter2 {B,C}, counter3 {D}; queue B001 9:00, C001 9:02, B002 9:04,
/// A001 9:06, D001 9:08. S(A) = {A,B} -> A001 has 2 ahead (B001, B002); S(C) = {B,C} -> C001 has 1 (B001);
/// S(D) = {D} -> D001 has 0.
/// </summary>
public static class CallNextQueueMath
{
    /// <summary>Active counters, the ones listening to my service, and the heard lane set S.</summary>
    public sealed record HeardLanes(
        IReadOnlyList<Counter> ActiveCounters,
        IReadOnlyList<Counter> ListeningCounters,
        IReadOnlyList<Guid> HeardServiceIds);

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
        return new HeardLanes(active, listening, heard);
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

    /// <summary>Cross-lane people ahead of <paramref name="me"/> (see class summary).</summary>
    public static async Task<int> CountPeopleAheadAsync(
        QmsDbContext db, QueueEntry me, IReadOnlyCollection<Guid> heardServiceIds,
        DateOnly serviceDay, DateTimeOffset at, int earlyCallMinutes, CancellationToken ct = default)
    {
        var ids = heardServiceIds.ToList();
        var myCreatedAt = me.CreatedAt;
        var myId = me.Id;
        // Pre-filter in SQL (CreatedAt <= mine), then order in memory with the selector's own comparer so the
        // Id tiebreak uses exactly the .NET Guid ordering Call Next uses (SQL Server orders GUIDs differently).
        var candidates = await EligibleWaiting(db.QueueEntries.AsNoTracking(), me.BranchId, serviceDay, at, earlyCallMinutes)
            .Where(q => ids.Contains(q.ServiceTypeId) && q.Id != myId && q.CreatedAt <= myCreatedAt)
            .Select(q => new { q.Id, q.CreatedAt })
            .ToListAsync(ct);
        return candidates.Count(c => QueueCallNextSelector.CompareCallOrder(c.CreatedAt, c.Id, myCreatedAt, myId) < 0);
    }

    /// <summary>Convenience overload: resolves S and the branch day, then counts.</summary>
    public static async Task<int> CountPeopleAheadAsync(
        QmsDbContext db, QueueEntry me, Branch branch, DateTimeOffset at, CancellationToken ct = default)
    {
        var lanes = await ResolveHeardLanesAsync(db, me.BranchId, me.ServiceTypeId, ct);
        return await CountPeopleAheadAsync(
            db, me, lanes.HeardServiceIds, BranchDay(branch, at), at, branch.OnlineEarlyCallMinutes, ct);
    }
}
