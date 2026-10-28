namespace QMS.Api.Services;

/// <summary>
/// Pure validation of slot shape (duration + grid alignment) — no DB, no async.
/// Used by both CreateBookingAsync and RescheduleBookingAsync so the rules live in one place.
/// </summary>
public static class BookingSlotRules
{
    /// <summary>
    /// Validates that <paramref name="slotStart"/>/<paramref name="slotEnd"/> form a single grid-aligned
    /// slot of exactly <paramref name="slotMinutes"/> within the service window.
    /// Returns null on success, or the error message on failure.
    /// </summary>
    public static string? ValidateSlotShape(
        DateTimeOffset slotStart,
        DateTimeOffset slotEnd,
        int slotMinutes,
        DateTimeOffset serviceWindowStart,
        DateTimeOffset serviceWindowEnd)
    {
        // Duration must equal exactly one slot
        if (slotEnd != slotStart.AddMinutes(slotMinutes))
            return $"Invalid slot: duration must be exactly {slotMinutes} minutes.";

        // Must be within the service window
        if (slotStart < serviceWindowStart || slotEnd > serviceWindowEnd)
            return "This time slot is outside branch service hours.";

        // Must align to the opening-time grid
        var minutesFromOpen = (slotStart - serviceWindowStart).TotalMinutes;
        if (minutesFromOpen < 0 || minutesFromOpen % slotMinutes != 0)
            return "This time slot does not align with the booking grid.";

        return null;
    }
}
