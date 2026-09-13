import type { BranchDto, BranchOperatingHourRow, BranchOperationalSettings } from "../api";

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

  const offsetMinutes = settings?.serviceZoneOffsetMinutes ?? branch.serviceZoneOffsetMinutes ?? 480;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const branchNow = new Date(utcMs + offsetMinutes * 60000);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[branchNow.getDay()];

  const todayHours = hours.find((h) => h.dayOfWeek.toLowerCase() === todayName.toLowerCase());
  if (!todayHours || todayHours.isClosed) return false;
  if (todayHours.openMinutesFromMidnight == null || todayHours.closeMinutesFromMidnight == null) return true;

  const currentMinutes = branchNow.getHours() * 60 + branchNow.getMinutes();
  return (
    currentMinutes >= todayHours.openMinutesFromMidnight && currentMinutes < todayHours.closeMinutesFromMidnight
  );
}
