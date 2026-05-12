namespace QMS.Application.Capacity;

/// <summary>Result of capacity bucket math: total slot capacity split online vs walk-in buffer.</summary>
public sealed record SlotCapacityPlan(
    int TotalCapacity,
    int OnlineCapacity,
    int WalkInBufferCapacity,
    double AvgServiceMinutesUsed,
    int ActiveCountersUsed);

public interface ICapacityEngine
{
    SlotCapacityPlan Compute(
        int slotDurationMinutes,
        double avgServiceMinutes,
        int activeCounters,
        int onlineQuotaPercent);
}

public sealed class CapacityEngine : ICapacityEngine
{
    public SlotCapacityPlan Compute(
        int slotDurationMinutes,
        double avgServiceMinutes,
        int activeCounters,
        int onlineQuotaPercent)
    {
        if (avgServiceMinutes <= 0) avgServiceMinutes = 1;
        if (activeCounters < 0) activeCounters = 0;
        onlineQuotaPercent = Math.Clamp(onlineQuotaPercent, 0, 100);

        var perCounter = (int)Math.Floor(slotDurationMinutes / avgServiceMinutes);
        var total = perCounter * activeCounters;
        var online = (int)Math.Floor(onlineQuotaPercent / 100.0 * total);
        var walkIn = Math.Max(0, total - online);

        return new SlotCapacityPlan(total, online, walkIn, avgServiceMinutes, activeCounters);
    }
}
