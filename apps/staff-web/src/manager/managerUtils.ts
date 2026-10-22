import type { BranchOperatingHourRow, ManagerCounterRowDto } from "../api";
import type { AssignableStaffDto } from "../api";

export const MGR_SVC_COLORS = ["#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd", "#64748b", "#94a3b8"];

export function minsToClock(m: number): string {
  const h = Math.floor(m / 60);
  const mi = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mi.toString().padStart(2, "0")} ${ampm}`;
}

export function minsToTimeInput(m: number | null): string {
  if (m == null) return "";
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${h.toString().padStart(2, "0")}:${mi.toString().padStart(2, "0")}`;
}

export function timeInputToMins(value: string): number | null {
  if (!value) return null;
  const [h, mi] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(mi)) return null;
  return h * 60 + mi;
}

export function defaultWeeklyHours(): BranchOperatingHourRow[] {
  const row = (day: string, weekend: boolean): BranchOperatingHourRow =>
    weekend
      ? { dayOfWeek: day, isClosed: true, openMinutesFromMidnight: null, closeMinutesFromMidnight: null }
      : {
          dayOfWeek: day,
          isClosed: false,
          openMinutesFromMidnight: 9 * 60,
          closeMinutesFromMidnight: 17 * 60,
        };
  return [
    row("Monday", false),
    row("Tuesday", false),
    row("Wednesday", false),
    row("Thursday", false),
    row("Friday", false),
    row("Saturday", true),
    row("Sunday", true),
  ];
}

export function crowdFromQueue(n: number): { label: string; level: "low" | "medium" | "high" } {
  if (n <= 5) return { label: "Low", level: "low" };
  if (n <= 15) return { label: "Medium", level: "medium" };
  return { label: "High", level: "high" };
}

export function staffDisplayName(r: ManagerCounterRowDto, pick: AssignableStaffDto[]): string {
  if (!r.assignedStaffEmail) return "Unassigned";
  return pick.find((s) => s.email === r.assignedStaffEmail)?.name ?? r.assignedStaffEmail;
}

export function counterModeKey(mode: string): "active" | "break" | "closed" {
  const k = mode.toLowerCase();
  if (k === "active") return "active";
  if (k === "break") return "break";
  return "closed";
}

export function counterStats(rows: ManagerCounterRowDto[]) {
  let open = 0;
  let brk = 0;
  let closed = 0;
  for (const r of rows) {
    const k = counterModeKey(r.mode);
    if (k === "active") open += 1;
    else if (k === "break") brk += 1;
    else closed += 1;
  }
  return { open, break: brk, closed, total: rows.length };
}

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatMinutesShort(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return "—";
  // One unit everywhere in the manager UI: whole minutes, "<1 min" below a minute.
  if (m < 1) return "<1 min";
  return `${Math.round(m)} min`;
}

export function slaTone(percent: number | null | undefined): "good" | "warn" | "bad" | "muted" {
  if (percent == null) return "muted";
  if (percent >= 85) return "good";
  if (percent >= 70) return "warn";
  return "bad";
}


/** Friendly time-of-day greeting (local clock). */
export function greetingForHour(hour = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Short display name from an email / login (manager@x → Manager). */
export function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "manager";
  const local = email.split("@")[0]?.trim() || "manager";
  const token = local.split(/[._+-]/)[0] || local;
  return token.charAt(0).toUpperCase() + token.slice(1);
}
