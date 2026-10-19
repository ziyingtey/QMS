using Microsoft.EntityFrameworkCore;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

/// <summary>
/// One rule for "average service minutes" from SERVICE_LOGS, shared by the ML feature
/// RollingAvgServiceMinutes (WaitTimeFeatureBuilder), CounterSimulationEstimator and the training simulation
/// (rolling_avg_service_minutes in ml/generate_seed_data.py + notebook):
/// mean of the last <see cref="Window"/> completed services (EndedAt &lt;= at) whose duration is at least
/// <see cref="MinDurationSeconds"/>; with fewer than <see cref="MinSamples"/> valid services the caller's default
/// (ServiceType.DefaultAvgServiceMinutes) is used.
/// Example: logs of 3 s, 5 s and 4 s (test clicks) -> ignored -> 0 valid -> default 15 (was 0.07 min).
/// </summary>
public static class RollingServiceAverage
{
    public const int Window = 30;
    public const int MinSamples = 5;
    public const int MinDurationSeconds = 30;

    /// <summary>Mean in minutes of the newest valid durations, or null when fewer than <see cref="MinSamples"/>.</summary>
    public static double? FromDurationsNewestFirst(IEnumerable<int> durationSecondsNewestFirst)
    {
        var valid = durationSecondsNewestFirst.Where(s => s >= MinDurationSeconds).Take(Window).ToList();
        return valid.Count < MinSamples ? null : valid.Average() / 60.0;
    }

    /// <summary>Rolling average (minutes) over the given services' logs, falling back to <paramref name="defaultMinutes"/>.</summary>
    public static async Task<double> MinutesAsync(
        QmsDbContext db, IReadOnlyCollection<Guid> serviceTypeIds, DateTimeOffset at, double defaultMinutes,
        CancellationToken ct = default)
    {
        var ids = serviceTypeIds.ToList();
        var durations = await db.ServiceSessionLogs.AsNoTracking()
            .Where(l => ids.Contains(l.ServiceTypeId)
                        && l.EndedAt <= at
                        && l.DurationSeconds >= MinDurationSeconds)
            .OrderByDescending(l => l.EndedAt)
            .Take(Window)
            .Select(l => l.DurationSeconds)
            .ToListAsync(ct);
        return FromDurationsNewestFirst(durations) ?? defaultMinutes;
    }
}
