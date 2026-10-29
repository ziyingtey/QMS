import type { BranchDto, BranchOperatingHourRow, BranchOperationalSettings } from "../api";
import { malaysiaNowParts } from "../malaysiaTime";

/** Whether the branch is within operating hours (matches customer app + API evaluator). */
export function isBranchOpenForOperations(
  branch: BranchDto | undefined,
  settings: BranchOperationalSettings | null,
): boolean {
  if (!branch) return false;

  const openingStatus = branch.openingStatus ?? "Open";
  if (openingStatus === "Closed") return false;

  const hours: BranchOperatingHourRow[] | undefined =
    settings?.weeklyOperatingHours?.length ? settings.weeklyOperatingHours : branch.weeklyOperatingHours;

  if (!hours || hours.length === 0) return openingStatus === "Open";

  // Branches run on Malaysia time regardless of the browser's timezone.
  const { weekday: todayName, minutesFromMidnight: currentMinutes } = malaysiaNowParts();

  const todayHours = hours.find((h) => h.dayOfWeek.toLowerCase() === todayName.toLowerCase());
  if (!todayHours || todayHours.isClosed) return false;
  if (todayHours.openMinutesFromMidnight == null || todayHours.closeMinutesFromMidnight == null) return true;

  return (
    currentMinutes >= todayHours.openMinutesFromMidnight && currentMinutes < todayHours.closeMinutesFromMidnight
  );
}
