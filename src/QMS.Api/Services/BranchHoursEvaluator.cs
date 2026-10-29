using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Domain.Time;

namespace QMS.Api.Services;

/// <summary>
/// Mirrors customer-app branch open logic: manager override, ad-hoc closures, then weekly hours in Malaysia time.
/// </summary>
public static class BranchHoursEvaluator
{
    public static bool IsBranchOpenNow(
        Branch branch,
        IReadOnlyList<BranchOperatingHour> weeklyHours,
        DateTimeOffset utcNow,
        IReadOnlyList<BranchClosure>? closures = null)
    {
        if (branch.OpeningStatus == BranchOpeningStatus.Closed)
            return false;

        // Ad-hoc closures override weekly hours
        if (closures is { Count: > 0 })
        {
            if (closures.Any(c => utcNow >= c.ClosedFrom && utcNow <= c.ClosedTo))
                return false;
        }

        if (weeklyHours.Count == 0)
            return branch.OpeningStatus == BranchOpeningStatus.Open;

        var localNow = MalaysiaTime.ToLocal(utcNow);
        var dowName = localNow.DayOfWeek.ToString();

        var row = weeklyHours.FirstOrDefault(h =>
            string.Equals(h.DayOfWeek, dowName, StringComparison.OrdinalIgnoreCase));
        if (row is null || row.IsClosed || row.OpenTime is null || row.CloseTime is null)
            return false;

        var openMin = (int)row.OpenTime.Value.TotalMinutes;
        var closeMin = (int)row.CloseTime.Value.TotalMinutes;
        if (closeMin <= openMin)
            return false;

        var currentMin = localNow.Hour * 60 + localNow.Minute;
        return currentMin >= openMin && currentMin < closeMin;
    }

    /// <summary>
    /// Today's closing time as an absolute offset, or null if no hours are configured / day is closed.
    /// Shared by after-hours sweep and drain-window checks so the rule lives in one place.
    /// </summary>
    public static DateTimeOffset? GetTodayCloseTime(
        Branch branch, IReadOnlyList<BranchOperatingHour> hours, DateTimeOffset utcNow)
    {
        var localNow = MalaysiaTime.ToLocal(utcNow);
        var dowName = localNow.DayOfWeek.ToString();
        var row = hours.FirstOrDefault(h =>
            string.Equals(h.DayOfWeek, dowName, StringComparison.OrdinalIgnoreCase));
        if (row is null || row.IsClosed || row.CloseTime is null)
            return null;
        var closeMin = (int)row.CloseTime.Value.TotalMinutes;
        var localDate = DateOnly.FromDateTime(localNow.DateTime);
        return MalaysiaTime.DayStart(localDate).AddMinutes(closeMin);
    }

    /// <summary>
    /// The drain deadline = closeTime + AfterHoursDrainWindowMinutes.
    /// Returns null when the branch has no close time today.
    /// </summary>
    public static DateTimeOffset? GetDrainDeadline(
        Branch branch, IReadOnlyList<BranchOperatingHour> hours, DateTimeOffset utcNow)
    {
        var closeTime = GetTodayCloseTime(branch, hours, utcNow);
        if (closeTime is null) return null;
        var drainMinutes = Math.Max(0, branch.AfterHoursDrainWindowMinutes);
        return closeTime.Value.AddMinutes(drainMinutes);
    }

    /// <summary>
    /// Whether the branch is currently in its after-hours drain window:
    /// past close time but before closeTime + drainMinutes. During this window counters
    /// with active tickets or queued work stay open; new walk-ins are already blocked.
    /// </summary>
    public static bool IsInDrainWindow(
        DateTimeOffset utcNow, Branch branch, IReadOnlyList<BranchOperatingHour> hours)
    {
        var closeTime = GetTodayCloseTime(branch, hours, utcNow);
        if (closeTime is null) return false;
        // Must be past close time (branch is closed) and before drain deadline
        if (utcNow < closeTime.Value) return false;
        var drainDeadline = GetDrainDeadline(branch, hours, utcNow);
        return drainDeadline is not null && utcNow < drainDeadline.Value;
    }
}
