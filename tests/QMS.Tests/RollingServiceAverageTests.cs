using QMS.Api.Services;

namespace QMS.Tests;

public class RollingServiceAverageTests
{
    [Fact]
    public void LessThanFiveSamples_ReturnsNull()
    {
        // 4 valid durations (>= 30 s)
        var durations = new[] { 120, 180, 90, 60 };
        Assert.Null(RollingServiceAverage.FromDurationsNewestFirst(durations));
    }

    [Fact]
    public void ExactlyFiveSamples_ReturnsAverage()
    {
        // 5 valid durations, all >= 30 s
        var durations = new[] { 60, 120, 180, 240, 300 };

        var result = RollingServiceAverage.FromDurationsNewestFirst(durations);

        Assert.NotNull(result);
        // mean = (60+120+180+240+300)/5 = 900/5 = 180 s = 3.0 min
        Assert.Equal(3.0, result.Value, precision: 2);
    }

    [Fact]
    public void SubThirtySecondDurations_AreDropped()
    {
        // 3 valid (>= 30 s), 5 invalid (< 30 s) = only 3 valid => null
        var durations = new[] { 120, 5, 3, 10, 29, 180, 15, 90 };

        Assert.Null(RollingServiceAverage.FromDurationsNewestFirst(durations));
    }

    [Fact]
    public void SubThirtySecondDropped_ButEnoughValid()
    {
        // 5 valid + some short ones
        var durations = new[] { 60, 5, 120, 3, 180, 240, 10, 300 };

        var result = RollingServiceAverage.FromDurationsNewestFirst(durations);

        Assert.NotNull(result);
        // valid: 60, 120, 180, 240, 300 (first 5 that pass >= 30)
        Assert.Equal(3.0, result.Value, precision: 2);
    }

    [Fact]
    public void WindowCapsAtThirty()
    {
        // 35 valid durations — only first 30 (newest) should be used
        var durations = Enumerable.Range(0, 35).Select(i => 60 + i * 10).ToArray();
        // durations: 60, 70, 80, ..., 400 (35 items)
        // Window takes first 30: 60..350

        var result = RollingServiceAverage.FromDurationsNewestFirst(durations);

        Assert.NotNull(result);
        var expected = durations.Take(RollingServiceAverage.Window).Average() / 60.0;
        Assert.Equal(expected, result.Value, precision: 6);
    }

    [Fact]
    public void EmptyInput_ReturnsNull()
    {
        Assert.Null(RollingServiceAverage.FromDurationsNewestFirst(Array.Empty<int>()));
    }

    [Fact]
    public void AllBelowMinDuration_ReturnsNull()
    {
        var durations = new[] { 1, 5, 10, 20, 29 };
        Assert.Null(RollingServiceAverage.FromDurationsNewestFirst(durations));
    }

    [Fact]
    public void Constants_AreDocumented()
    {
        Assert.Equal(30, RollingServiceAverage.Window);
        Assert.Equal(5, RollingServiceAverage.MinSamples);
        Assert.Equal(30, RollingServiceAverage.MinDurationSeconds);
    }
}
