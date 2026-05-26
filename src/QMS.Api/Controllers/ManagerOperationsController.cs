using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Dtos;
using QMS.Api.Services;
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
                body.OnlineQuotaPercent,
                body.SlotDurationMinutes,
                body.WeeklyOperatingHours,
                body.AdaptiveSlotCapacityEnabled,
                body.MinSlotTotalCapacity,
                body.MaxSlotTotalCapacity,
                body.OnlineEarlyCallMinutes,
                body.CalledAbsentGraceMinutes,
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
}

public sealed record ManagerBranchSettingsPatch(
    int? OnlineQuotaPercent,
    int? SlotDurationMinutes,
    IReadOnlyList<BranchOperatingHourRow>? WeeklyOperatingHours,
    bool? AdaptiveSlotCapacityEnabled,
    int? MinSlotTotalCapacity,
    int? MaxSlotTotalCapacity,
    int? OnlineEarlyCallMinutes,
    int? CalledAbsentGraceMinutes,
    bool? ClearMinSlotTotalCapacity,
    bool? ClearMaxSlotTotalCapacity);
