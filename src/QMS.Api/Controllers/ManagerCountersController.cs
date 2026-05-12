using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QMS.Api.Services;
using QMS.Domain.Enums;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Manager")]
[Route("api/manager/branches/{branchId:guid}/counters")]
public sealed class ManagerCountersController(QmsQueueService queue) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ManagerCounterRowDto>>> List(Guid branchId, CancellationToken cancellationToken)
    {
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

    /// <summary>Replace allowed service lanes. Empty list = General counter (may serve all lanes).</summary>
    [HttpPatch("{counterId:guid}/allowed-services")]
    public async Task<IActionResult> SetAllowedServices(
        Guid branchId,
        Guid counterId,
        [FromBody] ManagerCounterAllowedServicesRequest request,
        CancellationToken cancellationToken)
    {
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

    /// <summary>Optional “primary lane” display for staff (must be in allowed set unless counter is General).</summary>
    [HttpPatch("{counterId:guid}/dedicated-lane")]
    public async Task<IActionResult> SetDedicatedLane(
        Guid branchId,
        Guid counterId,
        [FromBody] ManagerCounterDedicatedLaneRequest request,
        CancellationToken cancellationToken)
    {
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
