namespace QMS.Application.Capacity;

/// <summary>Effective online / walk-in caps after applying branch min/max slot totals.</summary>
public sealed record EffectiveSlotCapacity(
    int TotalCapacity,
    int OnlineCapacity,
    int WalkInBufferCapacity);

/// <summary>
/// Merges <see cref="CapacityEngine"/> output with optional branch-wide floors/ceilings on total slot throughput.
/// Slot windows are generated in the API from operating hours + <c>SlotDurationMinutes</c>; there is no per-row template table.
/// </summary>
public static class AdaptiveSlotCapacity
{
    public static EffectiveSlotCapacity Resolve(
        SlotCapacityPlan dynamicPlan,
        int? minSlotTotalCapacity,
        int? maxSlotTotalCapacity,
        int onlineQuotaPercent)
    {
        onlineQuotaPercent = Math.Clamp(onlineQuotaPercent, 0, 100);
        var clamped = ClampAndResplit(dynamicPlan, minSlotTotalCapacity, maxSlotTotalCapacity, onlineQuotaPercent);
        return new EffectiveSlotCapacity(
            clamped.TotalCapacity,
            clamped.OnlineCapacity,
            clamped.WalkInBufferCapacity);
    }

    private static SlotCapacityPlan ClampAndResplit(
        SlotCapacityPlan dynamicPlan,
        int? minSlotTotalCapacity,
        int? maxSlotTotalCapacity,
        int onlineQuotaPercent)
    {
        var t = dynamicPlan.TotalCapacity;
        if (minSlotTotalCapacity is { } mn)
            t = Math.Max(mn, t);
        if (maxSlotTotalCapacity is { } mx)
            t = Math.Min(mx, t);
        t = Math.Max(0, t);

        var online = (int)Math.Floor(onlineQuotaPercent / 100.0 * t);
        var walk = Math.Max(0, t - online);
        return new SlotCapacityPlan(t, online, walk, dynamicPlan.AvgServiceMinutesUsed, dynamicPlan.ActiveCountersUsed);
    }
}
