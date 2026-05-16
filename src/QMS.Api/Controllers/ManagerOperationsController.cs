using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QMS.Api.Dtos;
using QMS.Api.Services;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Manager")]
[Route("api/manager")]
public sealed class ManagerOperationsController(QmsQueueService queue) : ControllerBase
{
    [HttpGet("assignable-staff")]
    public async Task<ActionResult<IReadOnlyList<AssignableStaffDto>>> AssignableStaff(CancellationToken cancellationToken)
    {
        var rows = await queue.ListAssignableStaffAsync(cancellationToken);
        return Ok(rows);
    }

    [HttpGet("branches/{branchId:guid}/operational-settings")]
    public async Task<ActionResult<BranchOperationalSettingsDto>> GetSettings(Guid branchId, CancellationToken cancellationToken)
    {
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
        try
        {
            await queue.UpdateBranchOperationalSettingsAsync(
                branchId,
                body.OnlineQuotaPercent,
                body.SlotDurationMinutes,
                body.WeeklyOperatingHours,
                body.AdaptiveSlotCapacityEnabled,
                body.MinSlotTotalCapacity,
                body.MaxSlotTotalCapacity,
                body.ClearMinSlotTotalCapacity == true,
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
}

public sealed record ManagerBranchSettingsPatch(
    int? OnlineQuotaPercent,
    int? SlotDurationMinutes,
    IReadOnlyList<BranchOperatingHourRow>? WeeklyOperatingHours,
    bool? AdaptiveSlotCapacityEnabled,
    int? MinSlotTotalCapacity,
    int? MaxSlotTotalCapacity,
    bool? ClearMinSlotTotalCapacity,
    bool? ClearMaxSlotTotalCapacity);
