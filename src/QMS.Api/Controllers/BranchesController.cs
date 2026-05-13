using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class BranchesController(QmsDbContext db, QmsQueueService queue) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BranchDto>>> List(CancellationToken cancellationToken)
    {
        var list = await db.Branches.AsNoTracking()
            .Include(b => b.Services)
            .Select(b => new BranchDto(
                b.Id,
                b.BranchCode,
                b.Name,
                b.Address,
                b.State,
                b.Latitude,
                b.Longitude,
                b.OnlineQuotaPercent,
                b.SlotDurationMinutes,
                b.GeofenceMeters,
                b.ServiceDayStartMinutes,
                b.ServiceDayEndMinutes,
                b.ServiceZoneOffsetMinutes,
                b.OperatingHours,
                b.OpeningStatus == BranchOpeningStatus.Open ? "Open" : "Closed",
                b.ImageUrl,
                b.Services.Select(s => new ServiceDto(s.Id, s.Code, s.Name, s.DefaultAvgServiceMinutes)).ToList()))
            .ToListAsync(cancellationToken);

        return Ok(list);
    }

    [AllowAnonymous]
    [HttpGet("{branchId:guid}/nearby")]
    public async Task<ActionResult<BranchDto>> Nearby(Guid branchId, [FromQuery] double lat, [FromQuery] double lng, CancellationToken cancellationToken)
    {
        return await Get(branchId, cancellationToken);
    }

    [AllowAnonymous]
    [HttpGet("{branchId:guid}")]
    public async Task<ActionResult<BranchDto>> Get(Guid branchId, CancellationToken cancellationToken)
    {
        var b = await db.Branches.AsNoTracking()
            .Include(x => x.Services)
            .Where(x => x.Id == branchId)
            .Select(x => new BranchDto(
                x.Id,
                x.BranchCode,
                x.Name,
                x.Address,
                x.State,
                x.Latitude,
                x.Longitude,
                x.OnlineQuotaPercent,
                x.SlotDurationMinutes,
                x.GeofenceMeters,
                x.ServiceDayStartMinutes,
                x.ServiceDayEndMinutes,
                x.ServiceZoneOffsetMinutes,
                x.OperatingHours,
                x.OpeningStatus == BranchOpeningStatus.Open ? "Open" : "Closed",
                x.ImageUrl,
                x.Services.Select(s => new ServiceDto(s.Id, s.Code, s.Name, s.DefaultAvgServiceMinutes)).ToList()))
            .FirstOrDefaultAsync(cancellationToken);

        return b is null ? NotFound() : Ok(b);
    }

    /// <summary>Public lane metrics for the customer app (crowd, ETA, waiting count).</summary>
    [AllowAnonymous]
    [HttpGet("{branchId:guid}/services/{serviceTypeId:guid}/summary")]
    public async Task<ActionResult<ServiceLaneSummaryDto>> ServiceSummary(
        Guid branchId,
        Guid serviceTypeId,
        CancellationToken cancellationToken)
    {
        try
        {
            var s = await queue.GetServiceLaneSummaryAsync(branchId, serviceTypeId, cancellationToken);
            return Ok(s);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    /// <summary>Values to encode on a static branch QR (HTTPS landing or deep link; mobile app parses query and calls walk-in API).</summary>
    [AllowAnonymous]
    [HttpGet("{branchId:guid}/walk-in-link")]
    public ActionResult<WalkInLinkDto> WalkInLink(Guid branchId, [FromQuery] Guid serviceTypeId)
    {
        var origin = $"{Request.Scheme}://{Request.Host.Value}";
        var qrUrl = $"{origin}/qms-walk-in?branchId={branchId}&serviceTypeId={serviceTypeId}";
        return Ok(new WalkInLinkDto(
            branchId,
            serviceTypeId,
            qrUrl,
            "POST /api/queue/walk-in with JSON body { branchId, serviceTypeId } — response: ticketNumber, walkInCapacitySlotStart, walkInCapacitySlotEnd (walk-in buffer used, may be next window if current is full)"));
    }
}

public sealed record ServiceDto(Guid Id, string Code, string Name, int DefaultAvgServiceMinutes);
public sealed record BranchDto(
    Guid Id,
    int BranchCode,
    string Name,
    string Address,
    string State,
    double Latitude,
    double Longitude,
    int OnlineQuotaPercent,
    int SlotDurationMinutes,
    int GeofenceMeters,
    int ServiceDayStartMinutes,
    int ServiceDayEndMinutes,
    int ServiceZoneOffsetMinutes,
    string? OperatingHours,
    string OpeningStatus,
    string? ImageUrl,
    IReadOnlyList<ServiceDto> Services);

public sealed record WalkInLinkDto(
    Guid BranchId,
    Guid ServiceTypeId,
    string QrUrl,
    string WalkInApiHint);
