using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Dtos;
using QMS.Api.Hubs;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>Persists in-app notifications and pushes live updates to the customer's SignalR group.</summary>
public sealed class CustomerNotificationService(
    QmsDbContext db,
    IHubContext<QueueHub> hubContext)
{
    private static readonly TimeSpan DedupeWindow = TimeSpan.FromMinutes(2);

    public async Task NotifyAsync(
        Guid customerId,
        NotificationKind type,
        string message,
        Guid? bookingId = null,
        string? ticketNumber = null,
        Guid? branchId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(message))
            return;

        var trimmed = message.Trim();
        var cutoff = DateTimeOffset.UtcNow.Subtract(DedupeWindow);
        var duplicate = await db.Notifications.AsNoTracking().AnyAsync(
            n => n.CustomerId == customerId
                 && n.Type == type
                 && n.BookingId == bookingId
                 && n.Message == trimmed
                 && n.SentAt >= cutoff,
            cancellationToken);
        if (duplicate)
            return;

        var row = new Notification
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            BookingId = bookingId,
            Type = type,
            Message = trimmed,
            SentAt = DateTimeOffset.UtcNow,
            IsRead = false
        };
        db.Notifications.Add(row);
        await db.SaveChangesAsync(cancellationToken);

        var dto = new CustomerNotificationDto(
            row.Id,
            type.ToString(),
            trimmed,
            bookingId,
            row.SentAt,
            false,
            ticketNumber,
            branchId);

        await hubContext.Clients
            .Group(QueueHub.CustomerGroup(customerId))
            .SendAsync("NewNotification", dto, cancellationToken);
    }
}
