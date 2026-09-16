using QMS.Domain.Entities;
using QMS.Domain.Enums;

namespace QMS.Api.Services;

/// <summary>
/// Mirrors customer-app branch open logic: manager override, ad-hoc closures, then weekly hours in branch local time.
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

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var localNow = utcNow.ToOffset(zone);
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
}
