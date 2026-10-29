using QMS.Api.Services;
using QMS.Domain.Time;

namespace QMS.Tests;

public class BranchClockTests
{
    private static readonly DateTimeOffset FixedUtc = new(2026, 10, 29, 4, 30, 0, TimeSpan.Zero);

    private sealed class FakeTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private readonly IBranchClock _clock = new BranchClock(new FakeTimeProvider(FixedUtc));

    [Fact]
    public void UtcNow_ReturnsFakeTime()
    {
        Assert.Equal(FixedUtc, _clock.UtcNow);
    }

    [Fact]
    public void LocalNow_Is_Plus8()
    {
        var local = _clock.LocalNow;
        Assert.Equal(12, local.Hour);  // 04:30 UTC = 12:30 MYT
        Assert.Equal(30, local.Minute);
        Assert.Equal(TimeSpan.FromHours(8), local.Offset);
    }

    [Fact]
    public void LocalToday_MatchesMalaysiaDate()
    {
        Assert.Equal(new DateOnly(2026, 10, 29), _clock.LocalToday);
    }

    [Fact]
    public void LocalDayStartUtc_Is_16h_PreviousDay()
    {
        var start = _clock.LocalDayStartUtc(new DateOnly(2026, 10, 29));
        Assert.Equal(new DateTimeOffset(2026, 10, 28, 16, 0, 0, TimeSpan.Zero), start);
    }

    [Fact]
    public void LocalDayEndUtc_Is_16h_SameDay()
    {
        var end = _clock.LocalDayEndUtc(new DateOnly(2026, 10, 29));
        Assert.Equal(new DateTimeOffset(2026, 10, 29, 16, 0, 0, TimeSpan.Zero), end);
    }

    [Fact]
    public void LocalToday_JustAfterMalaysiaMidnight_IsNewDay()
    {
        // 2026-10-29 16:30 UTC = 2026-10-30 00:30 MYT: still Oct 29 in UTC, but already Oct 30 in Malaysia.
        var clock = new BranchClock(new FakeTimeProvider(new DateTimeOffset(2026, 10, 29, 16, 30, 0, TimeSpan.Zero)));
        Assert.Equal(new DateOnly(2026, 10, 30), clock.LocalToday);
        Assert.Equal(new DateTimeOffset(2026, 10, 29, 16, 0, 0, TimeSpan.Zero), clock.LocalDayStartUtc(clock.LocalToday));
    }
}
