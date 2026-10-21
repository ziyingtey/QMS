namespace QMS.Api.Services;

/// <summary>
/// Thresholds for the manager "queue pressure" alert (appsettings section "ManagerAlerts"). Same rule as the
/// reactive manager in ml/generate_seed_data.py (REACTIVE_OPEN_QUEUE_PER_COUNTER / REACTIVE_OPEN_MAX_WAIT_MIN):
/// alert when a lane has at least <see cref="QueuePerCounterThreshold"/> queue-eligible waiting tickets per
/// Active counter serving it, or someone has waited at least <see cref="LongestWaitMinutesThreshold"/> minutes.
/// The alert only suggests an action; counters are never opened automatically.
/// </summary>
public sealed class ManagerAlertOptions
{
    public const string SectionName = "ManagerAlerts";

    /// <summary>Waiting tickets per Active counter serving the lane (simulation draws 3..6 per branch-day).</summary>
    public double QueuePerCounterThreshold { get; set; } = 4;

    /// <summary>Longest current wait in minutes since QueueEligibleAt (simulation draws 20..40 per branch-day).</summary>
    public double LongestWaitMinutesThreshold { get; set; } = 25;
}
