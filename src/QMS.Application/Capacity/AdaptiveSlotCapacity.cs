using QMS.Domain.Entities;

namespace QMS.Application.Capacity;

/// <summary>How <see cref="EffectiveSlotCapacity"/> was chosen (stored template vs live adaptive vs frozen mid-window).</summary>
public enum EffectiveSlotCapacitySource
{
    StoredProfile = 0,
    FrozenInWindow = 1,
    AdaptiveFuture = 2,
    ComputedNoPersistedTemplate = 3,
}

/// <summary>Effective online / walk-in caps for a concrete window after adaptive rules.</summary>
public sealed record EffectiveSlotCapacity(
    int TotalCapacity,
    int OnlineCapacity,
    int WalkInBufferCapacity,
    EffectiveSlotCapacitySource Source);

/// <summary>
/// Merges persisted TIME_SLOTS templates with live counter-driven capacity.
/// Future windows can shrink/grow with open counters; the current slot window stays on the stored split to avoid mid-window churn.
/// </summary>
public static class AdaptiveSlotCapacity
{
    public static EffectiveSlotCapacity Resolve(
        SlotCapacityPlan dynamicPlan,
        TimeSlot? storedRow,
        bool adaptiveSlotCapacityEnabled,
        int? minSlotTotalCapacity,
        int? maxSlotTotalCapacity,
        int onlineQuotaPercent,
        DateTimeOffset slotStart,
        DateTimeOffset slotEnd,
        DateTimeOffset nowAtBranch)
    {
        onlineQuotaPercent = Math.Clamp(onlineQuotaPercent, 0, 100);

        var clamped = ClampAndResplit(dynamicPlan, minSlotTotalCapacity, maxSlotTotalCapacity, onlineQuotaPercent);

        if (storedRow is null)
        {
            return new EffectiveSlotCapacity(
                clamped.TotalCapacity,
                clamped.OnlineCapacity,
                clamped.WalkInBufferCapacity,
                EffectiveSlotCapacitySource.ComputedNoPersistedTemplate);
        }

        if (!adaptiveSlotCapacityEnabled)
        {
            return new EffectiveSlotCapacity(
                storedRow.TotalCapacity,
                storedRow.OnlineQuota,
                storedRow.WalkInQuota,
                EffectiveSlotCapacitySource.StoredProfile);
        }

        var inCurrentServiceWindow = slotStart < slotEnd && slotStart <= nowAtBranch && slotEnd > nowAtBranch;
        if (inCurrentServiceWindow)
        {
            return new EffectiveSlotCapacity(
                storedRow.TotalCapacity,
                storedRow.OnlineQuota,
                storedRow.WalkInQuota,
                EffectiveSlotCapacitySource.FrozenInWindow);
        }

        var strictlyFuture = slotStart > nowAtBranch;
        if (strictlyFuture)
        {
            return new EffectiveSlotCapacity(
                clamped.TotalCapacity,
                clamped.OnlineCapacity,
                clamped.WalkInBufferCapacity,
                EffectiveSlotCapacitySource.AdaptiveFuture);
        }

        // Past windows (should not be offered for new bookings; keep stored numbers for any read-side consistency).
        return new EffectiveSlotCapacity(
            storedRow.TotalCapacity,
            storedRow.OnlineQuota,
            storedRow.WalkInQuota,
            EffectiveSlotCapacitySource.StoredProfile);
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
