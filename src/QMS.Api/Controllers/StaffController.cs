using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Staff")]
[Route("api/[controller]")]
public sealed class StaffController(QmsQueueService queue, QmsDbContext db) : ControllerBase
{
    private async Task<bool> OwnsBranch(Guid branchId, CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var staffId))
            return false;
        var staffBranchId = await db.StaffMembers.AsNoTracking()
            .Where(s => s.Id == staffId).Select(s => (Guid?)s.BranchId).FirstOrDefaultAsync(ct);
        return staffBranchId == branchId;
    }

    [HttpPost("call-next")]
    public async Task<ActionResult<CallNextDto>> CallNext([FromBody] CallNextRequest request, CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            var result = await queue.CallNextAsync(staffId, request.BranchId, cancellationToken);
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

    [HttpPost("mark-missed")]
    public async Task<IActionResult> MarkMissed([FromBody] TicketRequest request, CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            await queue.MarkMissedAsync(staffId, request.TicketNumber, cancellationToken);
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
        if (!await OwnsBranch(branchId, cancellationToken)) return Forbid();
        var list = await queue.ListWaitingTicketsAsync(branchId, serviceTypeId, cancellationToken);
        return Ok(list);
    }

    /// <summary>
    /// Cross-lane queue: waiting tickets across this counter's allowed services,
    /// ordered like successive Call Next picks (service queues longest-wait queue heads).
    /// </summary>
    [HttpGet("cross-lane-waiting")]
    public async Task<ActionResult<IReadOnlyList<WaitingTicketDto>>> CrossLaneWaiting(CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            return Ok(await queue.ListCrossLaneWaitingAsync(staffId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Transfer Waiting/Called ticket into another service queue (new letter+number).</summary>
    [HttpPost("transfer")]
    public async Task<ActionResult<TransferTicketDto>> Transfer(
        [FromBody] TransferTicketRequest request, CancellationToken cancellationToken)
    {
        var staffId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            return Ok(await queue.TransferTicketAsync(
                staffId, request.TicketNumber, request.TargetServiceTypeId, cancellationToken));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}

public sealed record CallNextRequest(Guid BranchId, Guid ServiceTypeId);
public sealed record TicketRequest(string TicketNumber);
public sealed record TransferTicketRequest(string TicketNumber, Guid TargetServiceTypeId);
