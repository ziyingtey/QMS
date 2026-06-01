import type { BranchDto } from "../api";

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

  // Get current time in branch timezone
  const offsetMinutes = branch.serviceZoneOffsetMinutes ?? 480; // default UTC+8
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const branchNow = new Date(utcMs + offsetMinutes * 60000);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[branchNow.getDay()];

  const todayHours = hours.find(
    (h) => h.dayOfWeek.toLowerCase() === todayName.toLowerCase(),
  );

  // No entry for today or explicitly closed today
  if (!todayHours || todayHours.isClosed) return "Closed";

  // Check if current time is within open/close range
  if (todayHours.openMinutesFromMidnight == null || todayHours.closeMinutesFromMidnight == null) {
    return "Open"; // no time bounds = open all day
  }

  const currentMinutes = branchNow.getHours() * 60 + branchNow.getMinutes();

  if (currentMinutes >= todayHours.openMinutesFromMidnight && currentMinutes < todayHours.closeMinutesFromMidnight) {
    return "Open";
  }

  return "Closed";
}

/** Returns formatted operating hours string for today, e.g. "09:30 - 16:00" */
export function getTodayHoursLabel(branch: BranchDto): string | null {
  const hours = branch.weeklyOperatingHours;
  if (!hours || hours.length === 0) return branch.operatingHours ?? null;

  const offsetMinutes = branch.serviceZoneOffsetMinutes ?? 480;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const branchNow = new Date(utcMs + offsetMinutes * 60000);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[branchNow.getDay()];

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
