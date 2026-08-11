namespace QMS.Api.Dtos;

public sealed record CustomerNotificationDto(
    Guid Id,
    string Type,
    string Message,
    Guid? BookingId,
    DateTimeOffset SentAt,
    bool IsRead,
    string? TicketNumber,
    Guid? BranchId);
