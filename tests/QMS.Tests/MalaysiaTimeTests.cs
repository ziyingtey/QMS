using QMS.Domain.Time;

namespace QMS.Tests;

public class MalaysiaTimeTests
{
    [Fact]
    public void Zone_Is_Plus8()
    {
        Assert.Equal(TimeSpan.FromHours(8), MalaysiaTime.Zone.BaseUtcOffset);
    }

    [Theory]
    [InlineData("2026-10-29T00:00:00+00:00", "2026-10-29")] // UTC midnight = 08:00 local, still Oct 29
    [InlineData("2026-10-28T15:59:59+00:00", "2026-10-28")] // 23:59:59 local
    [InlineData("2026-10-28T16:00:00+00:00", "2026-10-29")] // midnight local = Oct 29
    [InlineData("2026-10-29T23:30:00+00:00", "2026-10-30")] // 07:30 local next day: a ticket at 23:30 UTC belongs to the next Malaysia day
    [InlineData("2026-10-29T16:30:00+00:00", "2026-10-30")] // 00:30 local counts as Oct 30 (today), not Oct 29
    public void LocalDate_ReturnsCorrectMalaysiaDate(string utcIso, string expectedDate)
    {
        var utc = DateTimeOffset.Parse(utcIso);
        Assert.Equal(DateOnly.Parse(expectedDate), MalaysiaTime.LocalDate(utc));
    }

    [Theory]
    [InlineData(1)] // January
    [InlineData(7)] // July: Malaysia has no DST, so the offset never changes
    public void Offset_Is_Plus8_AllYear(int month)
    {
        var instant = new DateTimeOffset(2026, month, 15, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal(TimeSpan.FromHours(8), MalaysiaTime.ToLocal(instant).Offset);
    }

    [Fact]
    public void DayEndUtc_Is_16h_SameUtcDay()
    {
        Assert.Equal(
            new DateTimeOffset(2026, 10, 29, 16, 0, 0, TimeSpan.Zero),
            MalaysiaTime.DayEndUtc(new DateOnly(2026, 10, 29)));
    }

    [Fact]
    public void ToLocal_Offset_Is_Plus8()
    {
        var utcMidnight = new DateTimeOffset(2026, 10, 29, 0, 0, 0, TimeSpan.Zero);
        var local = MalaysiaTime.ToLocal(utcMidnight);
        Assert.Equal(TimeSpan.FromHours(8), local.Offset);
        Assert.Equal(8, local.Hour);
    }

    [Fact]
    public void DayStart_Returns_Midnight_Plus8()
    {
        var day = new DateOnly(2026, 10, 29);
        var start = MalaysiaTime.DayStart(day);
        Assert.Equal(0, start.Hour);
        Assert.Equal(0, start.Minute);
        Assert.Equal(TimeSpan.FromHours(8), start.Offset);
        Assert.Equal(day, DateOnly.FromDateTime(start.DateTime));
    }

    [Fact]
    public void DayEnd_Equals_NextDayStart()
    {
        var day = new DateOnly(2026, 10, 29);
        Assert.Equal(MalaysiaTime.DayStart(day.AddDays(1)), MalaysiaTime.DayEnd(day));
    }

    [Fact]
    public void DayStartUtc_Is_16h_PreviousDay()
    {
        // 2026-10-29 00:00 +08:00 = 2026-10-28 16:00 UTC
        var start = MalaysiaTime.DayStartUtc(new DateOnly(2026, 10, 29));
        Assert.Equal(TimeSpan.Zero, start.Offset);
        Assert.Equal(28, start.Day);
        Assert.Equal(16, start.Hour);
    }

    [Fact]
    public void LocalDateTimeToInstant_RoundTrips()
    {
        var date = new DateOnly(2026, 6, 15);
        var time = new TimeOnly(14, 30);
        var instant = MalaysiaTime.LocalDateTimeToInstant(date, time);
        Assert.Equal(14, instant.Hour);
        Assert.Equal(30, instant.Minute);
        Assert.Equal(TimeSpan.FromHours(8), instant.Offset);
        Assert.Equal(date, MalaysiaTime.LocalDate(instant));
    }
}
