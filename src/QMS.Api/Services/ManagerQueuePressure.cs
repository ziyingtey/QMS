using QMS.Domain.Enums;

namespace QMS.Api.Services;

/// <summary>One service lane at "now" for <see cref="ManagerQueuePressure.Evaluate"/>.</summary>
/// <param name="EligibleWaiting">Waiting, checked-in tickets with QueueEligibleAt &lt;= now (Call Next pool).</param>
/// <param name="ActiveCountersServing">Active counters whose allowed services include this lane.</param>
/// <param name="LongestWaitMinutes">now - oldest QueueEligibleAt among <paramref name="EligibleWaiting"/>.</param>
public sealed record QueuePressureLane(
    Guid ServiceTypeId, string ServiceName, string Prefix,
    int EligibleWaiting, int ActiveCountersServing, double LongestWaitMinutes);

/// <param name="Busy">Holding a Called/Serving ticket right now.</param>
public sealed record QueuePressureCounter(
    Guid Id, int Number, CounterMode Mode, IReadOnlyCollection<Guid> AllowedServiceIds, bool Busy);

public sealed record QueuePressureResult(ManagerInsightAlertDto Alert, ManagerSuggestionDto? Suggestion);

/// <summary>
/// Manager "queue pressure" alert: the live counterpart of the reactive manager in ml/generate_seed_data.py
/// (simulate_day, REACTIVE_* / REASSIGN_* constants). Pressure (waiting per serving counter >= threshold, or no counter serves the lane) suggests
/// opening a Closed counter, preferring one that already has the service ticked; a long wait with no pressure
/// suggests ticking the service on the least busy Active counter that does not serve it yet (mid-day service
/// reassignment), falling back to the other action when the preferred one is impossible. Never acts by itself.
/// </summary>
public static class ManagerQueuePressure
{
    public const string AlertKind = "queue_pressure";

    public static QueuePressureResult? Evaluate(
        QueuePressureLane lane,
        IReadOnlyList<QueuePressureCounter> counters,
        IReadOnlyDictionary<Guid, int> eligibleWaitingByService,
        ManagerAlertOptions options)
    {
        if (lane.EligibleWaiting <= 0) return null;

        var noCounter = lane.ActiveCountersServing <= 0;
        var perCounter = noCounter ? double.PositiveInfinity : (double)lane.EligibleWaiting / lane.ActiveCountersServing;
        var pressure = noCounter || perCounter >= options.QueuePerCounterThreshold;
        var longWait = lane.LongestWaitMinutes >= options.LongestWaitMinutesThreshold;
        if (!pressure && !longWait) return null;

        // Closed counter to open: one that already serves the lane first, then the lowest number.
        var closed = counters
            .Where(c => c.Mode == CounterMode.Closed)
            .OrderByDescending(c => c.AllowedServiceIds.Contains(lane.ServiceTypeId))
            .ThenBy(c => c.Number)
            .FirstOrDefault();

        // Reassignment target: Active counter not serving the lane; idle first, then the fewest waiting tickets
        // in its own lanes (simulation: least busy counter by waiting load), then the lowest number.
        var reassign = counters
            .Where(c => c.Mode == CounterMode.Active && !c.AllowedServiceIds.Contains(lane.ServiceTypeId))
            .OrderBy(c => c.Busy)
            .ThenBy(c => c.AllowedServiceIds.Sum(s => eligibleWaitingByService.TryGetValue(s, out var n) ? n : 0))
            .ThenBy(c => c.Number)
            .FirstOrDefault();

        string action;
        QueuePressureCounter? target;
        if (pressure)
            (action, target) = closed != null ? ("open_counter", closed) : reassign != null ? ("add_service", reassign) : ("none", null);
        else
            (action, target) = reassign != null ? ("add_service", reassign) : closed != null ? ("open_counter", closed) : ("none", null);

        var longest = (int)Math.Round(lane.LongestWaitMinutes);
        var head = $"{lane.ServiceName}: {lane.EligibleWaiting} waiting, longest {longest} min";
        var servingText = noCounter ? "no counter serves it" : $"{lane.ActiveCountersServing} counter(s) serving";

        string message;
        ManagerSuggestionDto? suggestion = null;
        switch (action)
        {
            case "open_counter":
            {
                var servesAlready = target!.AllowedServiceIds.Contains(lane.ServiceTypeId);
                message = $"{head} — open a counter for {lane.Prefix} (counter #{target.Number})";
                suggestion = new ManagerSuggestionDto("open_counter",
                    $"Open counter #{target.Number}",
                    $"{lane.ServiceName} ({lane.Prefix}): {lane.EligibleWaiting} waiting, longest {longest} min, {servingText}. "
                    + (servesAlready
                        ? $"Counter #{target.Number} already serves {lane.Prefix}; set it to Active."
                        : $"Set counter #{target.Number} to Active and tick {lane.ServiceName}."),
                    lane.ServiceTypeId, target.Number, target.Id);
                break;
            }
            case "add_service":
                message = $"{head} — add {lane.Prefix} to counter #{target!.Number} ({(target.Busy ? "least busy" : "idle")})";
                suggestion = new ManagerSuggestionDto("add_service",
                    $"Add {lane.Prefix} to counter #{target.Number}",
                    $"{lane.ServiceName} ({lane.Prefix}): {lane.EligibleWaiting} waiting, longest {longest} min, {servingText}. "
                    + $"Counter #{target.Number} is {(target.Busy ? "the least busy" : "idle")}; tick {lane.ServiceName} on it.",
                    lane.ServiceTypeId, target.Number, target.Id);
                break;
            default:
                message = $"{head} — every counter is open and already serves {lane.Prefix}";
                break;
        }

        var alert = new ManagerInsightAlertDto("warning", message, AlertKind, lane.ServiceTypeId,
            action == "none" ? null : action, target?.Number);
        return new QueuePressureResult(alert, suggestion);
    }
}
