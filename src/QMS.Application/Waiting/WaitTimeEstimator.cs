namespace QMS.Application.Waiting;

/// <summary>
/// Formula-based wait time estimator (production fallback).
/// Uses: PeopleAhead * EffectiveAvgServiceMinutes / ServiceEligibleActiveCounters.
/// </summary>
public sealed class FormulaWaitTimeEstimator : IWaitTimeEstimator
{
    public (double Minutes, PredictionSource Source) Estimate(WaitTimeFeatures features)
    {
        var counters = Math.Max(1, features.ServiceEligibleActiveCounters);
        var ahead = features.PeopleAhead + features.NowServing;
        if (ahead <= 0) return (0, PredictionSource.FormulaFallback);

        var eta = ahead * features.EffectiveAvgServiceMinutes / counters;
        return (eta, PredictionSource.FormulaFallback);
    }
}

/// <summary>Legacy static helper — kept for backward compatibility during transition.</summary>
public static class WaitTimeEstimator
{
    public static double EstimateMinutes(int peopleAhead, double avgServiceMinutes, int activeCounters)
    {
        if (activeCounters <= 0) return double.PositiveInfinity;
        if (peopleAhead <= 0) return 0;
        return peopleAhead * avgServiceMinutes / activeCounters;
    }
}
