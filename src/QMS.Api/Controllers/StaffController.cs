using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QMS.Api.Services;
using QMS.Domain.Enums;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Staff")]
[Route("api/[controller]")]
public sealed class StaffController(QmsQueueService queue) : ControllerBase
{
    [HttpPost("call-next")]
    public async Task<ActionResult<CallNextDto>> CallNext([FromBody] CallNextRequest request, CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            var result = await queue.CallNextAsync(staffId, request.BranchId, request.ServiceTypeId, cancellationToken);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("start-service")]
    public async Task<IActionResult> Start([FromBody] TicketRequest request, CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            await queue.StartServiceAsync(staffId, request.TicketNumber, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("end-service")]
    public async Task<IActionResult> End([FromBody] TicketRequest request, CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            await queue.EndServiceAsync(staffId, request.TicketNumber, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("my-counter")]
    public async Task<ActionResult<MyCounterDto>> MyCounter(CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            var dto = await queue.GetMyCounterAsync(staffId, cancellationToken);
            return Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("branches/{branchId:guid}/services/{serviceTypeId:guid}/waiting")]
    public async Task<ActionResult<IReadOnlyList<WaitingTicketDto>>> Waiting(
        Guid branchId,
        Guid serviceTypeId,
        CancellationToken cancellationToken)
    {
        var list = await queue.ListWaitingTicketsAsync(branchId, serviceTypeId, cancellationToken);
        return Ok(list);
    }
}

public sealed record CallNextRequest(Guid BranchId, Guid ServiceTypeId);
public sealed record TicketRequest(string TicketNumber);
