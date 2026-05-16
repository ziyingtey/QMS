namespace QMS.Api.Dtos;

/// <summary>One weekday row for API responses and manager PATCH (send all 7 days to replace).</summary>
public sealed record BranchOperatingHourRow(
    string DayOfWeek,
    bool IsClosed,
    int? OpenMinutesFromMidnight,
    int? CloseMinutesFromMidnight);
