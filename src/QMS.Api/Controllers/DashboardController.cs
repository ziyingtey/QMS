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
        var waiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting,
            cancellationToken);

        var serving = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Serving,
            cancellationToken);

        var activeCounters = await db.Counters.CountAsync(
            c => c.BranchId == branchId && c.Mode == CounterMode.Active,
            cancellationToken);

        var avgWaitSeconds = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.State == QueueEntryState.Done && q.CalledAt != null)
            .Select(q => (double?)(q.CalledAt!.Value - q.CreatedAt).TotalSeconds)
            .AverageAsync(cancellationToken) ?? 0;

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
            var eta = WaitTimeEstimator.EstimateMinutes(ahead, s.DefaultAvgServiceMinutes, Math.Max(1, laneCounters));
            etaByService.Add(new ServiceEtaDto(s.Id, ahead, double.IsInfinity(eta) ? null : Math.Round(eta, 1)));
        }

        var dayStart = DateTimeOffset.UtcNow.ToUniversalTime().Date;
        var dayEnd = dayStart.AddDays(1);
        var customersServedToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.State == QueueEntryState.Done
                 && q.ServingEndedAt != null
                 && q.ServingEndedAt >= dayStart
                 && q.ServingEndedAt < dayEnd,
            cancellationToken);

        var priorityWaiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.State == QueueEntryState.Waiting
                 && q.EntryType == QueueEntryType.OnlineBooked
                 && q.Booking != null
                 && q.Booking.CheckedInAt != null,
            cancellationToken);

        return Ok(new LiveDashboardDto(
            waiting + serving,
            waiting,
            Math.Round(avgWaitSeconds / 60.0, 1),
            activeCounters,
            customersServedToday,
            priorityWaiting,
            etaByService));
    }
}

public sealed record ServiceEtaDto(Guid ServiceTypeId, int QueueLength, double? EstimatedWaitMinutes);
public sealed record LiveDashboardDto(
    int CustomersInBranch,
    int QueueLength,
    double AvgWaitMinutes,
    int ActiveCounters,
    int CustomersServedToday,
    int PriorityWaiting,
    IReadOnlyList<ServiceEtaDto> ByService);
