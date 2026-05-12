namespace QMS.Application.Waiting;

public static class WaitTimeEstimator
{
    /// <summary>ETA ≈ (peopleAhead × avgService) / activeCounters</summary>
    public static double EstimateMinutes(int peopleAhead, double avgServiceMinutes, int activeCounters)
    {
        if (activeCounters <= 0) return double.PositiveInfinity;
        if (peopleAhead <= 0) return 0;
        return peopleAhead * avgServiceMinutes / activeCounters;
    }
}
