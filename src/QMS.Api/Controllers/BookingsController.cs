using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Services;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Authorize(Policy = "Customer")]
[Route("api/[controller]")]
public sealed class BookingsController(QmsQueueService queue, QmsDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<BookingCreatedDto>> Create([FromBody] CreateBookingRequest request, CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            var created = await queue.CreateBookingAsync(
                userId,
                request.BranchId,
                request.ServiceTypeId,
                request.SlotStart,
                request.SlotEnd,
                cancellationToken);
            return Ok(created);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("{bookingId:guid}/check-in")]
    public async Task<IActionResult> CheckIn(
        Guid bookingId,
        [FromBody] CheckInRequest? body,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            await queue.CheckInAsync(
                userId,
                bookingId,
                body?.Latitude,
                body?.Longitude,
                cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            if (ex.Message.Contains("geofence", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = ex.Message });
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPatch("{bookingId:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(
        Guid bookingId,
        [FromBody] RescheduleBookingRequest request,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            await queue.RescheduleBookingAsync(
                userId,
                bookingId,
                request.SlotStart,
                request.SlotEnd,
                cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            if (ex.Message.Contains("capacity", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = ex.Message });
            if (ex.Message.Contains("cannot be rescheduled", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = ex.Message });
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("{bookingId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid bookingId, CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            await queue.CancelBookingAsync(userId, bookingId, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IReadOnlyList<BookingSummaryDto>>> Mine(CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rows = await db.Bookings.AsNoTracking()
            .Where(b => b.CustomerId == userId)
            .OrderByDescending(b => b.SlotStart)
            .Select(b => new BookingSummaryDto(
                b.Id,
                b.BranchId,
                b.ServiceTypeId,
                b.SlotStart,
                b.SlotEnd,
                b.Status.ToString(),
                b.QueueEntry != null ? b.QueueEntry.TicketNumber : null))
            .ToListAsync(cancellationToken);
        return Ok(rows);
    }
}

public sealed record CheckInRequest(double? Latitude, double? Longitude);
public sealed record RescheduleBookingRequest(DateTimeOffset SlotStart, DateTimeOffset SlotEnd);
public sealed record CreateBookingRequest(Guid BranchId, Guid ServiceTypeId, DateTimeOffset SlotStart, DateTimeOffset SlotEnd);
public sealed record BookingSummaryDto(
    Guid Id,
    Guid BranchId,
    Guid ServiceTypeId,
    DateTimeOffset SlotStart,
    DateTimeOffset SlotEnd,
    string Status,
    string? TicketNumber);
