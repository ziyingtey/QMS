using QMS.Api.Services;
using QMS.Domain.Entities;
using QMS.Domain.Enums;

namespace QMS.Tests;

public class BranchHoursEvaluatorTests
{
    // Branch in UTC+8, Thursday, open 09:00–17:00, 60 min drain window
    private static readonly TimeSpan Zone = TimeSpan.FromHours(8);
    private static Branch MakeBranch(int drainMinutes = 60) => new()
    {
        Id = Guid.NewGuid(),
        ServiceZoneOffsetMinutes = (int)Zone.TotalMinutes,
        OpeningStatus = BranchOpeningStatus.Open,
        AfterHoursDrainWindowMinutes = drainMinutes,
    };

    private static readonly List<BranchOperatingHour> Hours =
    [
        new() { DayOfWeek = "Thursday", OpenTime = TimeSpan.FromHours(9), CloseTime = TimeSpan.FromHours(17), IsClosed = false },
    ];

    // Thursday 2026-10-29
    private static DateTimeOffset LocalToUtc(int hour, int minute = 0) =>
        new DateTimeOffset(2026, 10, 29, hour, minute, 0, Zone).ToUniversalTime();

    // ── IsBranchOpenNow ──

    [Fact]
    public void OpenDuringHours()
    {
        Assert.True(BranchHoursEvaluator.IsBranchOpenNow(MakeBranch(), Hours, LocalToUtc(12)));
    }

    [Fact]
    public void ClosedBeforeOpen()
    {
        Assert.False(BranchHoursEvaluator.IsBranchOpenNow(MakeBranch(), Hours, LocalToUtc(8, 59)));
    }

    [Fact]
    public void ClosedAtCloseTime()
    {
        // At exactly 17:00, currentMin (1020) is not < closeMin (1020)
        Assert.False(BranchHoursEvaluator.IsBranchOpenNow(MakeBranch(), Hours, LocalToUtc(17)));
    }

    [Fact]
    public void ClosedOnDayWithNoHours()
    {
        // Friday has no row
        var friday = new DateTimeOffset(2026, 10, 30, 12, 0, 0, Zone).ToUniversalTime();
        Assert.False(BranchHoursEvaluator.IsBranchOpenNow(MakeBranch(), Hours, friday));
    }

    [Fact]
    public void UsesMalaysiaWeekday_NotUtcWeekday()
    {
        // Thursday 2026-10-29 18:00 UTC is Friday 02:00 MYT. The branch is only open on Thursday,
        // so evaluating with the UTC weekday would wrongly pick the Thursday row.
        var thursdayEveningUtc = new DateTimeOffset(2026, 10, 29, 18, 0, 0, TimeSpan.Zero);
        var allDayThursday = new List<BranchOperatingHour>
        {
            new() { DayOfWeek = "Thursday", OpenTime = TimeSpan.Zero, CloseTime = TimeSpan.FromHours(24), IsClosed = false },
        };
        Assert.False(BranchHoursEvaluator.IsBranchOpenNow(MakeBranch(), allDayThursday, thursdayEveningUtc));
    }

    [Fact]
    public void ManagerOverrideClosed()
    {
        var branch = MakeBranch();
        branch.OpeningStatus = BranchOpeningStatus.Closed;
        Assert.False(BranchHoursEvaluator.IsBranchOpenNow(branch, Hours, LocalToUtc(12)));
    }

    // ── IsInDrainWindow ──

    [Fact]
    public void BeforeClose_NotInDrain()
    {
        Assert.False(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(16, 59), MakeBranch(), Hours));
    }

    [Fact]
    public void ExactlyAtClose_InDrain()
    {
        // 17:00 = past close (>= closeTime), before drain deadline (18:00)
        Assert.True(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(17, 0), MakeBranch(), Hours));
    }

    [Fact]
    public void InsideDrain_InDrain()
    {
        Assert.True(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(17, 30), MakeBranch(), Hours));
    }

    [Fact]
    public void AtDrainEnd_NotInDrain()
    {
        // Exactly at drain deadline (18:00), utcNow < drainDeadline is false
        Assert.False(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(18, 0), MakeBranch(), Hours));
    }

    [Fact]
    public void AfterDrainEnd_NotInDrain()
    {
        Assert.False(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(19, 0), MakeBranch(), Hours));
    }

    [Fact]
    public void ClosedDay_NotInDrain()
    {
        var closedHours = new List<BranchOperatingHour>
        {
            new() { DayOfWeek = "Thursday", IsClosed = true },
        };
        Assert.False(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(17, 30), MakeBranch(), closedHours));
    }

    [Fact]
    public void ZeroDrainMinutes_NotInDrainAtClose()
    {
        // With drain = 0, drainDeadline = closeTime, so utcNow < drainDeadline is false at close
        Assert.False(BranchHoursEvaluator.IsInDrainWindow(LocalToUtc(17, 0), MakeBranch(drainMinutes: 0), Hours));
    }

    // ── GetTodayCloseTime ──

    [Fact]
    public void GetTodayCloseTime_ReturnsCorrectTime()
    {
        var closeTime = BranchHoursEvaluator.GetTodayCloseTime(MakeBranch(), Hours, LocalToUtc(12));
        Assert.NotNull(closeTime);
        var local = closeTime.Value.ToOffset(Zone);
        Assert.Equal(17, local.Hour);
        Assert.Equal(0, local.Minute);
    }

    [Fact]
    public void GetTodayCloseTime_ClosedDay_ReturnsNull()
    {
        var closedHours = new List<BranchOperatingHour>
        {
            new() { DayOfWeek = "Thursday", IsClosed = true },
        };
        Assert.Null(BranchHoursEvaluator.GetTodayCloseTime(MakeBranch(), closedHours, LocalToUtc(12)));
    }

    // ── GetDrainDeadline ──

    [Fact]
    public void GetDrainDeadline_Returns_CloseTimePlusDrainMinutes()
    {
        var deadline = BranchHoursEvaluator.GetDrainDeadline(MakeBranch(), Hours, LocalToUtc(12));
        Assert.NotNull(deadline);
        var local = deadline.Value.ToOffset(Zone);
        Assert.Equal(18, local.Hour); // 17:00 + 60 min
    }
}
