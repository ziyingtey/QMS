using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Application.Waiting;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Staff")]
[Route("api/branches/{branchId:guid}/[controller]")]
public sealed class DashboardController(QmsDbContext db, QmsQueueService queue) : ControllerBase
{
    private async Task<bool> OwnsBranch(Guid branchId, CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var staffId))
            return false;
        var staffBranchId = await db.StaffMembers.AsNoTracking()
            .Where(s => s.Id == staffId).Select(s => (Guid?)s.BranchId).FirstOrDefaultAsync(ct);
        return staffBranchId == branchId;
    }

    [HttpGet("live")]
    public async Task<ActionResult<LiveDashboardDto>> Live(Guid branchId, CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        var now = DateTimeOffset.UtcNow;

        // Use branch-local service day instead of UTC date
        var branch = await db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken);
        if (branch is null) return NotFound();
        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowLocal = now.ToOffset(zone);
        var todayDate = DateOnly.FromDateTime(nowLocal.DateTime);
        var dayStartOffset = new DateTimeOffset(todayDate.ToDateTime(TimeOnly.MinValue), zone);
        var dayEndOffset = dayStartOffset.AddDays(1);

        var waiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting
                 && q.CheckedIn
                 && q.ServiceDay == todayDate,
            cancellationToken);

        var serving = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Serving,
            cancellationToken);

        var walkInsWaiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting && q.EntryType == QueueEntryType.WalkIn,
            cancellationToken);

        var onlineWaiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting && q.EntryType == QueueEntryType.OnlineBooked,
            cancellationToken);

        var waitingRows = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.State == QueueEntryState.Waiting)
            .Select(q => new { q.QueueId, q.ServiceTypeId, q.QueueEligibleAt, q.CreatedAt, q.CheckedIn })
            .ToListAsync(cancellationToken);

        // "Waiting too long" uses each lane's own ServiceLevelMinutes and the same wait start as
        // Service Lanes / Analytics (LaneWaitRules), so the counts match across pages.
        var laneTargets = await db.BranchQueues.AsNoTracking()
            .Where(bq => bq.BranchId == branchId)
            .ToDictionaryAsync(bq => bq.Id, bq => bq.ServiceLevelMinutes, cancellationToken);
        var serviceLaneMap = await db.ServiceTypes.AsNoTracking()
            .Where(s => s.BranchId == branchId && s.QueueId != null)
            .ToDictionaryAsync(s => s.Id, s => s.QueueId!.Value, cancellationToken);

        var longestTicketToCallMinutes = 0.0;
        var ticketToCallBreaches = 0;
        // Only checked-in tickets are really waiting in the branch (same set as the Live Monitor list).
        foreach (var q in waitingRows.Where(r => r.CheckedIn))
        {
            var minutes = LaneWaitRules.MinutesWaiting(now, q.QueueEligibleAt, q.CreatedAt);
            // Branch-wide max (not yet eligible online tickets count as 0).
            longestTicketToCallMinutes = Math.Max(longestTicketToCallMinutes, minutes);
            var target = LaneWaitRules.TargetMinutes(q.QueueId, q.ServiceTypeId, serviceLaneMap, laneTargets);
            if (LaneWaitRules.IsTooLong(minutes, target)) ticketToCallBreaches++;
        }

        var activeCounters = await db.Counters.CountAsync(
            c => c.BranchId == branchId && c.Mode == CounterMode.Active,
            cancellationToken);

        var completedToday = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId
                        && q.State == QueueEntryState.Completed
                        && q.CalledAt != null
                        && q.ServingEndedAt >= dayStartOffset
                        && q.ServingEndedAt < dayEndOffset)
            .Select(q => new { q.CreatedAt, q.CalledAt, q.QueueEligibleAt })
            .ToListAsync(cancellationToken);

        // Same wait rule as Analytics (LaneWaitRules): wait start to CalledAt.
        var ticketToCallToday = completedToday
            .Select(q => LaneWaitRules.MinutesToCall(q.CalledAt!.Value, q.QueueEligibleAt, q.CreatedAt))
            .ToList();
        var avgTicketToCallMinutes = ticketToCallToday.Count > 0
            ? Math.Round(ticketToCallToday.Average(), 1)
            : 0.0;

        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => s.BranchId == branchId)
            .Select(s => new { s.Id, s.DefaultAvgServiceMinutes })
            .ToListAsync(cancellationToken);

        var etaByService = new List<ServiceEtaDto>();
        foreach (var s in services)
        {
            var ahead = await db.QueueEntries.CountAsync(
                q => q.BranchId == branchId && q.ServiceTypeId == s.Id && q.State == QueueEntryState.Waiting
                     && q.CheckedIn
                     && q.ServiceDay == todayDate,
                cancellationToken);
            var laneServing = await db.QueueEntries.CountAsync(
                q => q.BranchId == branchId && q.ServiceTypeId == s.Id && q.State == QueueEntryState.Serving,
                cancellationToken);
            var laneCounters = await queue.CountActiveLaneCountersAsync(branchId, s.Id, cancellationToken);
            // Aggregate lane ETA — same formula as Manager Insights: (waiting + serving) × avg / counters
            var eta = WaitTimeEstimator.EstimateMinutes(ahead + laneServing, s.DefaultAvgServiceMinutes, Math.Max(1, laneCounters));
            etaByService.Add(new ServiceEtaDto(s.Id, ahead, double.IsInfinity(eta) ? null : Math.Round(eta, 1)));
        }

        var customersServedToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.State == QueueEntryState.Completed
                 && q.ServingEndedAt != null
                 && q.ServingEndedAt >= dayStartOffset
                 && q.ServingEndedAt < dayEndOffset,
            cancellationToken);

        // Walk-ins today: by service day (walk-in created today → served today)
        var walkInsToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.EntryType == QueueEntryType.WalkIn
                 && q.ServiceDay == todayDate,
            cancellationToken);

        // Appointments today: bookings whose slot is today (not when the booking was created)
        var appointmentsToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.EntryType == QueueEntryType.OnlineBooked
                 && q.ServiceDay == todayDate,
            cancellationToken);

        var onlineCheckInsWaiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.State == QueueEntryState.Waiting
                 && q.EntryType == QueueEntryType.OnlineBooked
                 && q.CheckedIn,
            cancellationToken);

        return Ok(new LiveDashboardDto(
            waiting + serving,
            waiting,
            serving,
            avgTicketToCallMinutes,
            Math.Round(longestTicketToCallMinutes, 1),
            activeCounters,
            customersServedToday,
            walkInsToday,
            appointmentsToday,
            walkInsWaiting,
            onlineWaiting,
            ticketToCallBreaches,
            onlineCheckInsWaiting,
            etaByService));
    }
}

public sealed record ServiceEtaDto(Guid ServiceTypeId, int QueueLength, double? EstimatedWaitMinutes);
public sealed record LiveDashboardDto(
    int CustomersInBranch,
    int QueueLength,
    int ServingCount,
    double AvgTicketToCallMinutes,
    double LongestTicketToCallMinutes,
    int ActiveCounters,
    int CustomersServedToday,
    int WalkInsToday,
    int AppointmentsToday,
    int WalkInsWaiting,
    int OnlineWaiting,
    int TicketToCallBreaches,
    int OnlineCheckInsWaiting,
    IReadOnlyList<ServiceEtaDto> ByService);
