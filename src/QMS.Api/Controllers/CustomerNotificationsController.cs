using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Dtos;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Controllers;

[ApiController]
[Route("api/customers/me/notifications")]
[Authorize(Policy = "Customer")]
public sealed class CustomerNotificationsController(QmsDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CustomerNotificationDto>>> List(
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        limit = Math.Clamp(limit, 1, 200);

        var rows = await db.Notifications.AsNoTracking()
            .Where(n => n.CustomerId == userId)
            .OrderByDescending(n => n.SentAt)
            .Take(limit)
            .Select(n => new CustomerNotificationDto(
                n.Id,
                n.Type.ToString(),
                n.Message,
                n.BookingId,
                n.SentAt,
                n.IsRead,
                n.Booking != null && n.Booking.QueueEntry != null ? n.Booking.QueueEntry.TicketNumber : null,
                n.Booking != null ? n.Booking.BranchId : (Guid?)null))
            .ToListAsync(cancellationToken);

        return Ok(rows);
    }

    [HttpGet("unread-count")]
    public async Task<ActionResult<UnreadCountDto>> UnreadCount(CancellationToken cancellationToken = default)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var count = await db.Notifications.CountAsync(
            n => n.CustomerId == userId && !n.IsRead,
            cancellationToken);
        return Ok(new UnreadCountDto(count));
    }

    [HttpPatch("{notificationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid notificationId, CancellationToken cancellationToken = default)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var row = await db.Notifications.FirstOrDefaultAsync(
            n => n.Id == notificationId && n.CustomerId == userId,
            cancellationToken);
        if (row is null)
            return NotFound();

        row.IsRead = true;
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken = default)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await db.Notifications
            .Where(n => n.CustomerId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), cancellationToken);
        return NoContent();
    }
}

public sealed record UnreadCountDto(int Count);
