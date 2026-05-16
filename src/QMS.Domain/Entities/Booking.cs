using QMS.Domain.Enums;

namespace QMS.Domain.Entities;

public class Booking
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public Guid BranchId { get; set; }
    public Branch Branch { get; set; } = null!;
    public Guid ServiceTypeId { get; set; }
    public ServiceType ServiceType { get; set; } = null!;
    public DateTimeOffset SlotStart { get; set; }
    public DateTimeOffset SlotEnd { get; set; }
    public BookingStatus Status { get; set; } = BookingStatus.Confirmed;
    public DateTimeOffset? CheckedInAt { get; set; }
    public QueueEntry? QueueEntry { get; set; }
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
}
