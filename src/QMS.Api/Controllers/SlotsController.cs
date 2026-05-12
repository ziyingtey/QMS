using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QMS.Api.Services;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Customer")]
[Route("api/branches/{branchId:guid}/services/{serviceId:guid}/slots")]
public sealed class SlotsController(QmsQueueService queue) : ControllerBase
{
    /// <summary>Calendar date in the branch’s service zone (yyyy-MM-dd). Example: ?day=2026-05-05</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SlotDto>>> GetDay(
        Guid branchId,
        Guid serviceId,
        [FromQuery] string day,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(day))
            return BadRequest(new { message = "Missing ?day=yyyy-MM-dd (branch local calendar date)." });

        if (!DateOnly.TryParse(day, CultureInfo.InvariantCulture, DateTimeStyles.None, out var calendarDay))
            return BadRequest(new { message = "Invalid day. Use yyyy-MM-dd." });

        var slots = await queue.GetSlotsAsync(branchId, serviceId, calendarDay, cancellationToken);
        return Ok(slots);
    }
}
