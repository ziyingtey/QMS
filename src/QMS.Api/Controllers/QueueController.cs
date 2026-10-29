using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Domain.Enums;
using QMS.Domain.Time;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class QueueController(QmsQueueService queue, QmsDbContext db, WalkInTokenService walkInTokens, IBranchClock clock) : ControllerBase
{
    const string ScanQrMessage = "Please scan the QR code at the branch to take a walk-in ticket.";

    /// <summary>
    /// Public walk-in (branch QR → web page). Requires today's branch token <c>t</c> (from the QR).
    /// Optional anonymous <c>X-Device-Id</c> header lets the page restore its tickets via <c>walk-in/mine</c>.
    /// No capacity / daily limit; only a global chained rate limiter (30/10 min per IP + 3/10 min per device).
    /// </summary>
    [AllowAnonymous]
    [HttpPost("walk-in")]
    public async Task<ActionResult<WalkInResponse>> WalkIn([FromBody] WalkInRequest request, CancellationToken cancellationToken)
    {
        var branchExists = await db.Branches.AsNoTracking()
            .AnyAsync(b => b.Id == request.BranchId, cancellationToken);
        if (!branchExists)
            return NotFound(new { message = "Branch not found." });
        if (string.IsNullOrWhiteSpace(request.T))
            return BadRequest(new { message = ScanQrMessage, code = "walkin_token_missing" });
        if (!walkInTokens.Validate(request.BranchId, request.T, clock.UtcNow))
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ScanQrMessage, code = "walkin_token_invalid" });

        return await IssueAsync(request.BranchId, request.ServiceTypeId, ReadDeviceId(), cancellationToken);
    }

    /// <summary>Today's tickets (branch-local day) taken on this anonymous device (X-Device-Id header).</summary>
    [AllowAnonymous]
    [HttpGet("walk-in/mine")]
    public async Task<ActionResult<IReadOnlyList<MyWalkInTicketDto>>> MyWalkIns([FromQuery] Guid branchId, CancellationToken cancellationToken)
    {
        var device = ReadDeviceId();
        if (device is null) return Ok(Array.Empty<MyWalkInTicketDto>());
        var branchExists = await db.Branches.AsNoTracking().AnyAsync(b => b.Id == branchId, cancellationToken);
        if (!branchExists) return NotFound(new { message = "Branch not found." });

        var startOfToday = MalaysiaTime.DayStart(clock.LocalToday);

        var rows = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.WalkInDeviceId == device && q.CreatedAt >= startOfToday)
            .OrderByDescending(q => q.CreatedAt)
            .Select(q => new { q.TicketNumber, q.ServiceTypeId, ServiceName = q.ServiceType.Name, q.State, q.CreatedAt })
            .Take(20)
            .ToListAsync(cancellationToken);
        return Ok(rows.Select(r => new MyWalkInTicketDto(
            r.TicketNumber, r.ServiceTypeId, r.ServiceName, r.State.ToString(),
            r.CreatedAt.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture))).ToList());
    }

    /// <summary>Staff/manager issues a walk-in ticket for a customer at the counter. No token, no rate limit.</summary>
    [Authorize(Policy = "Staff")]
    [HttpPost("walk-in/staff")]
    public async Task<ActionResult<WalkInResponse>> StaffWalkIn([FromBody] StaffWalkInRequest request, CancellationToken cancellationToken)
    {
        if (Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var staffId))
        {
            var staffBranch = await db.StaffMembers.AsNoTracking().Where(s => s.Id == staffId)
                .Select(s => (Guid?)s.BranchId).FirstOrDefaultAsync(cancellationToken);
            if (staffBranch is not null && staffBranch.Value != request.BranchId)
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "You can only issue tickets for your own branch." });
        }
        return await IssueAsync(request.BranchId, request.ServiceTypeId, null, cancellationToken);
    }

    /// <summary>
    /// Queue status for a single ticket. Authenticated users (staff/customer JWT) can query any ticket.
    /// Anonymous callers must provide either <c>bookingId</c> (unguessable GUID) or a matching
    /// <c>X-Device-Id</c> header (walk-in page).
    /// </summary>
    [AllowAnonymous]
    [HttpGet("status")]
    public async Task<ActionResult<QueueStatusDto>> Status([FromQuery] Guid branchId, [FromQuery] string ticket, [FromQuery] Guid? bookingId, CancellationToken cancellationToken)
    {
        if (User.Identity?.IsAuthenticated != true && !bookingId.HasValue)
        {
            var device = ReadDeviceId();
            if (device is null)
                return Unauthorized(new { message = "Provide a bookingId or X-Device-Id header to view ticket status." });
            var ownsTicket = await db.QueueEntries.AsNoTracking()
                .AnyAsync(q => q.BranchId == branchId && q.TicketNumber == ticket && q.WalkInDeviceId == device, cancellationToken);
            if (!ownsTicket) return NotFound();
        }

        var status = await queue.GetQueueStatusAsync(branchId, ticket, cancellationToken, bookingId);
        return status is null ? NotFound() : Ok(status);
    }

    async Task<ActionResult<WalkInResponse>> IssueAsync(Guid branchId, Guid serviceTypeId, string? deviceId, CancellationToken cancellationToken)
    {
        try
        {
            var created = await queue.WalkInAsync(branchId, serviceTypeId, cancellationToken, deviceId);
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

    string? ReadDeviceId()
    {
        var v = Request.Headers["X-Device-Id"].ToString().Trim();
        return string.IsNullOrEmpty(v) || v.Length > 64 ? null : v;
    }
}

/// <param name="T">Daily branch token from the QR code.</param>
public sealed record WalkInRequest(Guid BranchId, Guid ServiceTypeId, string? T = null);
public sealed record StaffWalkInRequest(Guid BranchId, Guid ServiceTypeId);
public sealed record WalkInResponse(string TicketNumber, string WalkInCapacitySlotStart, string WalkInCapacitySlotEnd);
public sealed record MyWalkInTicketDto(string TicketNumber, Guid ServiceTypeId, string ServiceName, string State, string CreatedAt);
