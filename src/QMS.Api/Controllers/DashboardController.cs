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
    [HttpGet("live")]
    public async Task<ActionResult<LiveDashboardDto>> Live(Guid branchId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var dayStart = now.ToUniversalTime().Date;
        var dayEnd = dayStart.AddDays(1);
        var dayStartOffset = new DateTimeOffset(dayStart, TimeSpan.Zero);
        var dayEndOffset = new DateTimeOffset(dayEnd, TimeSpan.Zero);

        var waiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting,
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
            .Select(q => new
            {
                q.EntryType,
                q.CreatedAt,
                q.AssignedSlotStart,
                CheckedInAt = q.Booking != null ? q.Booking.CheckedInAt : null,
            })
            .ToListAsync(cancellationToken);

        var waitingMinutes = waitingRows
            .Select(q => TicketToCallMetrics.MinutesInQueueNow(
                now, q.EntryType, q.CreatedAt, q.CheckedInAt, q.AssignedSlotStart))
            .ToList();
        const double ticketToCallTargetMinutes = 15;
        var longestTicketToCallMinutes = waitingMinutes.Count > 0 ? waitingMinutes.Max() : 0.0;
        var ticketToCallBreaches = waitingMinutes.Count(m => m > ticketToCallTargetMinutes);

        var activeCounters = await db.Counters.CountAsync(
            c => c.BranchId == branchId && c.Mode == CounterMode.Active,
            cancellationToken);

        var completedToday = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId
                        && q.State == QueueEntryState.Completed
                        && q.CalledAt != null
                        && q.ServingEndedAt >= dayStartOffset
                        && q.ServingEndedAt < dayEndOffset)
            .Select(q => new
            {
                q.EntryType,
                q.CreatedAt,
                q.CalledAt,
                q.AssignedSlotStart,
                CheckedInAt = q.Booking != null ? q.Booking.CheckedInAt : null,
            })
            .ToListAsync(cancellationToken);

        var ticketToCallToday = completedToday
            .Select(q => TicketToCallMetrics.MinutesToCall(
                q.CalledAt!.Value, q.EntryType, q.CreatedAt, q.CheckedInAt, q.AssignedSlotStart))
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
                q => q.BranchId == branchId && q.ServiceTypeId == s.Id && q.State == QueueEntryState.Waiting,
                cancellationToken);
            var laneCounters = await queue.CountActiveLaneCountersAsync(branchId, s.Id, cancellationToken);
            // Aggregate lane ETA — uses legacy formula (no per-entry features available)
            var eta = WaitTimeEstimator.EstimateMinutes(ahead, s.DefaultAvgServiceMinutes, Math.Max(1, laneCounters));
            etaByService.Add(new ServiceEtaDto(s.Id, ahead, double.IsInfinity(eta) ? null : Math.Round(eta, 1)));
        }

        var customersServedToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.State == QueueEntryState.Completed
                 && q.ServingEndedAt != null
                 && q.ServingEndedAt >= dayStartOffset
                 && q.ServingEndedAt < dayEndOffset,
            cancellationToken);

        var walkInsToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.EntryType == QueueEntryType.WalkIn
                 && q.CreatedAt >= dayStartOffset
                 && q.CreatedAt < dayEndOffset,
            cancellationToken);

        var appointmentsToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.EntryType == QueueEntryType.OnlineBooked
                 && q.CreatedAt >= dayStartOffset
                 && q.CreatedAt < dayEndOffset,
            cancellationToken);

        var onlineCheckInsWaiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.State == QueueEntryState.Waiting
                 && q.EntryType == QueueEntryType.OnlineBooked
                 && q.Booking != null
                 && q.Booking.CheckedInAt != null,
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
