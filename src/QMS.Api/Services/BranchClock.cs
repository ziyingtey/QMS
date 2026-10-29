using QMS.Domain.Time;

namespace QMS.Api.Services;

/// <summary>Testable clock for business-day/time queries in the Malaysia timezone.</summary>
public interface IBranchClock
{
    /// <summary>Current UTC instant (from <see cref="TimeProvider"/>).</summary>
    DateTimeOffset UtcNow { get; }

    /// <summary>Current instant expressed in Malaysia wall time.</summary>
    DateTimeOffset LocalNow { get; }

    /// <summary>Today's date on the Malaysia calendar.</summary>
    DateOnly LocalToday { get; }

    /// <summary>Start of the given Malaysia day in UTC.</summary>
    DateTimeOffset LocalDayStartUtc(DateOnly day);

    /// <summary>Exclusive end of the given Malaysia day in UTC.</summary>
    DateTimeOffset LocalDayEndUtc(DateOnly day);
}

/// <summary>Production implementation — delegates to <see cref="MalaysiaTime"/> and <see cref="TimeProvider"/>.</summary>
public sealed class BranchClock(TimeProvider timeProvider) : IBranchClock
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();
    public DateTimeOffset LocalNow => MalaysiaTime.ToLocal(UtcNow);
    public DateOnly LocalToday => MalaysiaTime.LocalDate(UtcNow);
    public DateTimeOffset LocalDayStartUtc(DateOnly day) => MalaysiaTime.DayStartUtc(day);
    public DateTimeOffset LocalDayEndUtc(DateOnly day) => MalaysiaTime.DayEndUtc(day);
}
