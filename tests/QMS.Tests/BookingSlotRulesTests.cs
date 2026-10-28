using QMS.Api.Services;

namespace QMS.Tests;

public class BookingSlotRulesTests
{
    private static readonly DateTimeOffset WindowStart = new(2026, 10, 29, 9, 0, 0, TimeSpan.FromHours(8));
    private static readonly DateTimeOffset WindowEnd = new(2026, 10, 29, 17, 0, 0, TimeSpan.FromHours(8));
    private const int SlotMinutes = 30;

    [Fact]
    public void ValidAlignedSlot_ReturnsNull()
    {
        var start = WindowStart; // 09:00
        var end = start.AddMinutes(SlotMinutes);

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.Null(error);
    }

    [Fact]
    public void SecondAlignedSlot_ReturnsNull()
    {
        var start = WindowStart.AddMinutes(SlotMinutes); // 09:30
        var end = start.AddMinutes(SlotMinutes);

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.Null(error);
    }

    [Fact]
    public void OffGridSlot_10_07_ReturnsError()
    {
        // 10:07 does not align to 30-min grid from 09:00
        var start = WindowStart.AddMinutes(67);
        var end = start.AddMinutes(SlotMinutes);

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.NotNull(error);
        Assert.Contains("grid", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void WrongDuration_ReturnsError()
    {
        var start = WindowStart;
        var end = start.AddMinutes(45); // 45 != 30

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.NotNull(error);
        Assert.Contains("duration", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SlotBeforeWindow_ReturnsError()
    {
        var start = WindowStart.AddMinutes(-SlotMinutes);
        var end = WindowStart;

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.NotNull(error);
        Assert.Contains("outside", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SlotAfterWindow_ReturnsError()
    {
        var start = WindowEnd;
        var end = start.AddMinutes(SlotMinutes);

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.NotNull(error);
        Assert.Contains("outside", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void LastValidSlot_ReturnsNull()
    {
        var start = WindowEnd.AddMinutes(-SlotMinutes); // 16:30
        var end = WindowEnd;

        var error = BookingSlotRules.ValidateSlotShape(start, end, SlotMinutes, WindowStart, WindowEnd);

        Assert.Null(error);
    }
}
