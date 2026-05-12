using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QMS.Api.Services;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class QueueController(QmsQueueService queue) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("walk-in")]
    public async Task<ActionResult<WalkInResponse>> WalkIn([FromBody] WalkInRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var created = await queue.WalkInAsync(request.BranchId, request.ServiceTypeId, cancellationToken);
            return Ok(new WalkInResponse(
                created.TicketNumber,
                created.WalkInCapacitySlotStart.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture),
                created.WalkInCapacitySlotEnd.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture)));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [AllowAnonymous]
    [HttpGet("status")]
    public async Task<ActionResult<QueueStatusDto>> Status([FromQuery] Guid branchId, [FromQuery] string ticket, CancellationToken cancellationToken)
    {
        var status = await queue.GetQueueStatusAsync(branchId, ticket, cancellationToken);
        return status is null ? NotFound() : Ok(status);
    }
}

public sealed record WalkInRequest(Guid BranchId, Guid ServiceTypeId);
public sealed record WalkInResponse(string TicketNumber, string WalkInCapacitySlotStart, string WalkInCapacitySlotEnd);
