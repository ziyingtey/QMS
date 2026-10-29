namespace QMS.Domain.Time;

/// <summary>
/// Single source of truth for Malaysia timezone math (UTC+8, no DST).
/// All branches operate in this zone; timestamps are stored in UTC,
/// but business dates and operating hours use the Malaysia calendar.
/// </summary>
public static class MalaysiaTime
{
    /// <summary>IANA zone identifier (Linux / macOS / .NET 6+).</summary>
    public const string IanaZoneId = "Asia/Kuala_Lumpur";

    /// <summary>Windows zone identifier.</summary>
    public const string WindowsZoneId = "Singapore Standard Time";

    /// <summary>Fixed +08:00 offset used when neither IANA nor Windows zone is available.</summary>
    public static readonly TimeSpan FallbackOffset = TimeSpan.FromHours(8);

    /// <summary>Resolved timezone — IANA first, then Windows, then a custom fixed zone.</summary>
    public static TimeZoneInfo Zone { get; } = ResolveZone();

    private static TimeZoneInfo ResolveZone()
    {
        foreach (var id in new[] { IanaZoneId, WindowsZoneId })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                // Try the next identifier.
            }
            catch (InvalidTimeZoneException)
            {
                // Corrupt tz data on this host; try the next identifier.
            }
        }

        // Neither id is available (e.g. minimal container without tzdata): Malaysia has no DST,
        // so a fixed +08:00 zone is behaviourally identical.
        return TimeZoneInfo.CreateCustomTimeZone(
            "Malaysia Fixed +08:00",
            FallbackOffset,
            "Malaysia Standard Time (fixed)",
            "Malaysia Standard Time (fixed)");
    }

    /// <summary>Convert a UTC instant to the Malaysia wall clock.</summary>
    public static DateTimeOffset ToLocal(DateTimeOffset instant) =>
        TimeZoneInfo.ConvertTime(instant, Zone);

    /// <summary>Malaysia calendar date for a UTC instant.</summary>
    public static DateOnly LocalDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(ToLocal(instant).DateTime);

    /// <summary>
    /// Build a <see cref="DateTimeOffset"/> from a Malaysia civil date + time.
    /// The offset is derived from the zone (always +08:00 since Malaysia has no DST).
    /// </summary>
    public static DateTimeOffset LocalDateTimeToInstant(DateOnly date, TimeOnly time)
    {
        var unspecified = new DateTime(date, time, DateTimeKind.Unspecified);
        var offset = Zone.GetUtcOffset(unspecified);
        return new DateTimeOffset(unspecified, offset);
    }

    /// <summary>Malaysia midnight for a given date (inclusive start of day).</summary>
    public static DateTimeOffset DayStart(DateOnly date) =>
        LocalDateTimeToInstant(date, TimeOnly.MinValue);

    /// <summary>Next Malaysia midnight (exclusive end of day = start of next day).</summary>
    public static DateTimeOffset DayEnd(DateOnly date) =>
        DayStart(date.AddDays(1));

    /// <summary><see cref="DayStart"/> converted to UTC — handy for DB filters.</summary>
    public static DateTimeOffset DayStartUtc(DateOnly date) =>
        DayStart(date).ToUniversalTime();

    /// <summary><see cref="DayEnd"/> converted to UTC — handy for DB filters.</summary>
    public static DateTimeOffset DayEndUtc(DateOnly date) =>
        DayEnd(date).ToUniversalTime();
}
