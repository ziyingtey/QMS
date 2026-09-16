using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Dtos;
using QMS.Api.Services;
using QMS.Domain.Entities;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Manager")]
[Route("api/manager")]
public sealed class ManagerOperationsController(QmsQueueService queue, QmsDbContext db) : ControllerBase
{
    private async Task<bool> OwnsBranch(Guid branchId, CancellationToken ct)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == staffId, ct);
        return staff is not null && staff.BranchId == branchId;
    }

    [HttpGet("branches/{branchId:guid}/assignable-staff")]
    public async Task<ActionResult<IReadOnlyList<AssignableStaffDto>>> AssignableStaffForBranch(
        Guid branchId,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            var rows = await queue.ListAssignableStaffForBranchAsync(branchId, cancellationToken);
            return Ok(rows);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("branches/{branchId:guid}/operational-settings")]
    public async Task<ActionResult<BranchOperationalSettingsDto>> GetSettings(Guid branchId, CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            return Ok(await queue.GetBranchOperationalSettingsAsync(branchId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPatch("branches/{branchId:guid}/operational-settings")]
    public async Task<ActionResult<BranchOperationalSettingsDto>> PatchSettings(
        Guid branchId,
        [FromBody] ManagerBranchSettingsPatch body,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            await queue.UpdateBranchOperationalSettingsAsync(
                branchId,
                body.SlotDurationMinutes,
                body.WeeklyOperatingHours,
                body.MaxSlotTotalCapacity,
                body.OnlineEarlyCallMinutes,
                body.CalledAbsentGraceMinutes,
                body.NextWeekBookingOpensOnDay,
                body.ClearMaxSlotTotalCapacity == true,
                cancellationToken);
            return Ok(await queue.GetBranchOperationalSettingsAsync(branchId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("branches/{branchId:guid}/insights")]
    public async Task<ActionResult<ManagerInsightsDto>> Insights(Guid branchId, CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            _ = await queue.GetBranchOperationalSettingsAsync(branchId, cancellationToken);
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }

        return Ok(await queue.GetManagerInsightsAsync(branchId, cancellationToken));
    }

    [HttpGet("branches/{branchId:guid}/analytics/today")]
    public async Task<ActionResult<BranchAnalyticsTodayDto>> AnalyticsToday(
        Guid branchId,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            return Ok(await queue.GetBranchAnalyticsTodayAsync(branchId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("branches/{branchId:guid}/waiting-queue")]
    public async Task<ActionResult<IReadOnlyList<ManagerWaitingTicketDto>>> WaitingQueue(
        Guid branchId,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            return Ok(await queue.ListBranchWaitingQueueForManagerAsync(branchId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("branches/{branchId:guid}/appointments/today")]
    public async Task<ActionResult<ManagerAppointmentsTodayDto>> AppointmentsToday(
        Guid branchId,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            return Ok(await queue.GetManagerAppointmentsTodayAsync(branchId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
    // ─────────────────────────────────────────────────────────────────────
    // BRANCH CLOSURES
    // ─────────────────────────────────────────────────────────────────────

    [HttpGet("branches/{branchId:guid}/closures")]
    public async Task<ActionResult<IReadOnlyList<BranchClosureDto>>> ListClosures(
        Guid branchId, CancellationToken ct)
    {
        if (!await OwnsBranch(branchId, ct)) return Forbid();
        var closures = await db.BranchClosures.AsNoTracking()
            .Where(c => c.BranchId == branchId)
            .OrderBy(c => c.ClosedFrom)
            .Select(c => new BranchClosureDto(c.Id, c.ClosedFrom, c.ClosedTo, c.Reason))
            .ToListAsync(ct);
        return Ok(closures);
    }

    [HttpPost("branches/{branchId:guid}/closures")]
    public async Task<ActionResult<BranchClosureDto>> CreateClosure(
        Guid branchId, [FromBody] CreateClosureRequest body, CancellationToken ct)
    {
        if (!await OwnsBranch(branchId, ct)) return Forbid();
        if (body.ClosedTo < body.ClosedFrom)
            return BadRequest(new { message = "ClosedTo must be >= ClosedFrom." });

        var closure = new BranchClosure
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            ClosedFrom = body.ClosedFrom,
            ClosedTo = body.ClosedTo,
            Reason = body.Reason,
        };
        db.BranchClosures.Add(closure);
        await db.SaveChangesAsync(ct);
        return Created($"api/manager/branches/{branchId}/closures/{closure.Id}",
            new BranchClosureDto(closure.Id, closure.ClosedFrom, closure.ClosedTo, closure.Reason));
    }

    [HttpDelete("branches/{branchId:guid}/closures/{closureId:guid}")]
    public async Task<IActionResult> DeleteClosure(Guid branchId, Guid closureId, CancellationToken ct)
    {
        if (!await OwnsBranch(branchId, ct)) return Forbid();
        var closure = await db.BranchClosures
            .FirstOrDefaultAsync(c => c.Id == closureId && c.BranchId == branchId, ct);
        if (closure is null) return NotFound();
        db.BranchClosures.Remove(closure);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ─────────────────────────────────────────────────────────────────────
    // SERVICE OnlineSlotsPerSlot (per-service online booking quota)
    // ─────────────────────────────────────────────────────────────────────

    [HttpPatch("branches/{branchId:guid}/services/{serviceId:guid}/online-slots")]
    public async Task<IActionResult> UpdateOnlineSlotsPerSlot(
        Guid branchId, Guid serviceId, [FromBody] UpdateOnlineSlotsRequest body, CancellationToken ct)
    {
        if (!await OwnsBranch(branchId, ct)) return Forbid();
        var service = await db.ServiceTypes.FirstOrDefaultAsync(
            s => s.Id == serviceId && s.BranchId == branchId, ct);
        if (service is null) return NotFound(new { message = "Service not found." });

        service.OnlineSlotsPerSlot = Math.Max(0, body.OnlineSlotsPerSlot);
        await db.SaveChangesAsync(ct);
        return Ok(new { service.Id, service.OnlineSlotsPerSlot });
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEMPORARY COUNTER SERVICE ASSIGNMENT
    // ─────────────────────────────────────────────────────────────────────

    [HttpPost("counters/{counterId:guid}/temporary-service")]
    public async Task<IActionResult> AddTemporaryService(
        Guid counterId, [FromBody] AddTemporaryServiceRequest body, CancellationToken ct)
    {
        var counter = await db.Counters.Include(c => c.AllowedServices)
            .FirstOrDefaultAsync(c => c.Id == counterId, ct);
        if (counter is null) return NotFound(new { message = "Counter not found." });
        if (!await OwnsBranch(counter.BranchId, ct)) return Forbid();

        // Check if already assigned
        if (counter.AllowedServices.Any(a => a.ServiceTypeId == body.ServiceTypeId))
            return BadRequest(new { message = "Service already assigned to this counter." });

        var service = await db.ServiceTypes.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == body.ServiceTypeId && s.BranchId == counter.BranchId, ct);
        if (service is null) return NotFound(new { message = "Service not found in this branch." });

        db.CounterAllowedServices.Add(new CounterAllowedService
        {
            CounterId = counterId,
            ServiceTypeId = body.ServiceTypeId,
            IsTemporary = true,
            ExpiresAt = body.ExpiresAt,
        });
        await db.SaveChangesAsync(ct);
        return Ok(new { counterId, body.ServiceTypeId, IsTemporary = true, body.ExpiresAt });
    }
}

public sealed record BranchClosureDto(Guid Id, DateTimeOffset ClosedFrom, DateTimeOffset ClosedTo, string? Reason);
public sealed record CreateClosureRequest(DateTimeOffset ClosedFrom, DateTimeOffset ClosedTo, string? Reason);
public sealed record UpdateOnlineSlotsRequest(int OnlineSlotsPerSlot);
public sealed record AddTemporaryServiceRequest(Guid ServiceTypeId, DateTimeOffset? ExpiresAt);

public sealed record ManagerBranchSettingsPatch(
    int? SlotDurationMinutes,
    IReadOnlyList<BranchOperatingHourRow>? WeeklyOperatingHours,
    int? MaxSlotTotalCapacity,
    int? OnlineEarlyCallMinutes,
    int? CalledAbsentGraceMinutes,
    int? NextWeekBookingOpensOnDay,
    bool? ClearMaxSlotTotalCapacity);
