/**
 * Malaysia time helpers for staff-web — the single place that knows the QGo business timezone.
 *
 * All QGo branches operate in Malaysia time (MYT, UTC+8, no DST). The API sends instants with an
 * explicit offset, so displays and "today" values must be rendered in MYT regardless of the
 * browser's own timezone.
 */

export const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

/** Malaysia has no DST, so this fixed offset is always correct when turning a MYT calendar date into an instant. */
const MALAYSIA_UTC_OFFSET = "+08:00";

const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function toDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall-clock time in Malaysia, e.g. "2:30 PM". Returns "—" for invalid input. */
export function formatMyTime(value: string | Date, options: Intl.DateTimeFormatOptions = DEFAULT_TIME_OPTIONS): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString([], { ...options, timeZone: MALAYSIA_TIME_ZONE }) : "—";
}

/** Calendar date in Malaysia, e.g. "29 Oct". Returns "—" for invalid input. */
export function formatMyDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString([], { ...options, timeZone: MALAYSIA_TIME_ZONE }) : "—";
}

/** Date and time in Malaysia, e.g. "Thu 11:59 PM". Returns "—" for invalid input. */
export function formatMyDateTime(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  return d ? d.toLocaleString([], { ...options, timeZone: MALAYSIA_TIME_ZONE }) : "—";
}

function malaysiaPartsOf(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** Today's Malaysia calendar date as yyyy-MM-dd (for date-input `min`, local storage keys, etc.). */
export function malaysiaTodayYmd(now: Date = new Date()): string {
  const p = malaysiaPartsOf(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Current Malaysia weekday (e.g. "Thursday") and minutes since Malaysia midnight. */
export function malaysiaNowParts(now: Date = new Date()): { weekday: string; minutesFromMidnight: number } {
  const p = malaysiaPartsOf(now);
  return { weekday: p.weekday, minutesFromMidnight: Number(p.hour) * 60 + Number(p.minute) };
}

/** Start of a Malaysia calendar day (yyyy-MM-dd) as an ISO string with explicit offset. */
export function malaysiaDayStartIso(ymd: string): string {
  return `${ymd}T00:00:00.000${MALAYSIA_UTC_OFFSET}`;
}

/** Last millisecond of a Malaysia calendar day (yyyy-MM-dd), for inclusive "to" dates. */
export function malaysiaDayEndIso(ymd: string): string {
  return `${ymd}T23:59:59.999${MALAYSIA_UTC_OFFSET}`;
}
