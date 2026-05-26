using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Manager")]
[Route("api/manager/branches/{branchId:guid}/counters")]
public sealed class ManagerCountersController(QmsQueueService queue, QmsDbContext db) : ControllerBase
{
    private async Task<bool> OwnsBranch(Guid branchId, CancellationToken ct)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == staffId, ct);
        return staff is not null && staff.BranchId == branchId;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ManagerCounterRowDto>>> List(Guid branchId, CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        var rows = await queue.ListCountersForManagerAsync(branchId, cancellationToken);
        return Ok(rows);
    }

    [HttpPatch("{counterId:guid}/mode")]
    public async Task<IActionResult> SetMode(
        Guid branchId,
        Guid counterId,
        [FromBody] ManagerCounterModeRequest request,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            await queue.SetCounterModeForManagerAsync(branchId, counterId, request.Mode, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPatch("{counterId:guid}/staff")]
    public async Task<IActionResult> SetStaff(
        Guid branchId,
        Guid counterId,
        [FromBody] ManagerCounterStaffRequest request,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            await queue.SetCounterStaffForManagerAsync(branchId, counterId, request.StaffId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Replace allowed service lanes. At least one lane is required (no General / all-lanes counters).</summary>
    [HttpPatch("{counterId:guid}/allowed-services")]
    public async Task<IActionResult> SetAllowedServices(
        Guid branchId,
        Guid counterId,
        [FromBody] ManagerCounterAllowedServicesRequest request,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            await queue.SetCounterAllowedServicesForManagerAsync(branchId, counterId, request.ServiceTypeIds ?? Array.Empty<Guid>(), cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Optional "primary lane" display for staff (must be in the allowed set).</summary>
    [HttpPatch("{counterId:guid}/dedicated-lane")]
    public async Task<IActionResult> SetDedicatedLane(
        Guid branchId,
        Guid counterId,
        [FromBody] ManagerCounterDedicatedLaneRequest request,
        CancellationToken cancellationToken)
    {
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        try
        {
            await queue.SetCounterDedicatedLaneForManagerAsync(branchId, counterId, request.ServiceTypeId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}

public sealed record ManagerCounterDedicatedLaneRequest(Guid? ServiceTypeId);

public sealed record ManagerCounterModeRequest(CounterMode Mode);
public sealed record ManagerCounterStaffRequest(Guid? StaffId);
public sealed record ManagerCounterAllowedServicesRequest(IReadOnlyList<Guid> ServiceTypeIds);
