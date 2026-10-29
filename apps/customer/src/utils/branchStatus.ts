import type { BranchDto } from "../api";
import { branchNowParts, defaultBranchOffsetMinutes } from "./dateFormat";

export type BranchOpenStatus = "Open" | "Closed";

/**
 * Determines if a branch is currently open.
 * Priority:
 * 1. Manager override: if openingStatus === "Closed" → Closed
 * 2. Auto: check weeklyOperatingHours for current day/time in branch timezone
 * 3. Fallback: use openingStatus from API (defaults to "Open")
 */
export function getBranchOpenStatus(branch: BranchDto): BranchOpenStatus {
  // Manager override — if explicitly closed, always closed
  if (branch.openingStatus === "Closed") return "Closed";

  // If no weekly hours data, trust API field
  const hours = branch.weeklyOperatingHours;
  if (!hours || hours.length === 0) {
    return (branch.openingStatus as BranchOpenStatus) ?? "Open";
  }

  // Current Malaysia weekday and time (fixed-offset shift, independent of device timezone)
  const { weekday: todayName, minutesFromMidnight: currentMinutes } = branchNowParts(
    branch.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes,
  );

  const todayHours = hours.find(
    (h) => h.dayOfWeek.toLowerCase() === todayName.toLowerCase(),
  );

  // No entry for today or explicitly closed today
  if (!todayHours || todayHours.isClosed) return "Closed";

  // Check if current time is within open/close range
  if (todayHours.openMinutesFromMidnight == null || todayHours.closeMinutesFromMidnight == null) {
    return "Open"; // no time bounds = open all day
  }

  if (currentMinutes >= todayHours.openMinutesFromMidnight && currentMinutes < todayHours.closeMinutesFromMidnight) {
    return "Open";
  }

  return "Closed";
}

/** Returns formatted operating hours string for today, e.g. "09:30 - 16:00" */
export function getTodayHoursLabel(branch: BranchDto): string | null {
  const hours = branch.weeklyOperatingHours;
  if (!hours || hours.length === 0) return branch.operatingHours ?? null;

  const { weekday: todayName } = branchNowParts(branch.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes);

  const todayRow = hours.find(
    (h) => h.dayOfWeek.toLowerCase() === todayName.toLowerCase(),
  );

  if (!todayRow || todayRow.isClosed) return "Closed today";
  if (todayRow.openMinutesFromMidnight == null || todayRow.closeMinutesFromMidnight == null) return "Open all day";

  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
  };

  return `${fmt(todayRow.openMinutesFromMidnight)} - ${fmt(todayRow.closeMinutesFromMidnight)}`;
}
