export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toYmd(y: number, monthIndex0: number, day: number): string {
  return `${y}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

/** Lexicographic compare for yyyy-MM-dd strings. */
export function compareIsoYmd(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function parseYmd(ymd: string): { y: number; m0: number; d: number } {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return { y, m0: m - 1, d };
}

export function monthTitle(year: number, monthIndex0: number): string {
  return new Date(year, monthIndex0, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export type CalendarCell = {
  key: string;
  ymd: string;
  label: string;
  inMonth: boolean;
  disabled: boolean;
};

/** Monday-first month grid (6×7). Leading/trailing days are `inMonth: false` and disabled. */
export function buildMonthGrid(viewYear: number, viewMonth0: number, minYmd: string): CalendarCell[] {
  const dim = new Date(viewYear, viewMonth0 + 1, 0).getDate();
  const firstWd = new Date(viewYear, viewMonth0, 1).getDay();
  const lead = (firstWd + 6) % 7;
  const cells: CalendarCell[] = [];

  const prev = new Date(viewYear, viewMonth0, 0);
  const prevDim = prev.getDate();
  const prevY = prev.getFullYear();
  const prevM = prev.getMonth();
  for (let i = 0; i < lead; i++) {
    const d = prevDim - lead + i + 1;
    const ymd = toYmd(prevY, prevM, d);
    cells.push({ key: `p-${ymd}`, ymd, label: String(d), inMonth: false, disabled: true });
  }

  for (let d = 1; d <= dim; d++) {
    const ymd = toYmd(viewYear, viewMonth0, d);
    cells.push({
      key: `c-${ymd}`,
      ymd,
      label: String(d),
      inMonth: true,
      disabled: compareIsoYmd(ymd, minYmd) < 0,
    });
  }

  let ty = viewYear;
  let tm = viewMonth0 + 1;
  if (tm > 11) {
    tm = 0;
    ty++;
  }
  let td = 1;
  while (cells.length < 42) {
    const ymd = toYmd(ty, tm, td);
    cells.push({ key: `t-${cells.length}-${ymd}`, ymd, label: String(td), inMonth: false, disabled: true });
    td++;
    const dimM = new Date(ty, tm + 1, 0).getDate();
    if (td > dimM) {
      td = 1;
      tm++;
      if (tm > 11) {
        tm = 0;
        ty++;
      }
    }
  }

  return cells;
}

/**
 * Convert an API instant to civil date/time in the branch's fixed offset (no DST).
 * Same idea as branchCalendarYmd: shift by offset then read UTC fields.
 */
export function branchWallComponents(d: Date, branchOffsetMinutes: number): { y: number; m0: number; d: number; h: number; mi: number } {
  const off = Number.isFinite(branchOffsetMinutes) ? branchOffsetMinutes : 0;
  const shifted = new Date(d.getTime() + off * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    m0: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    mi: shifted.getUTCMinutes(),
  };
}

/** Default branch offset when not yet loaded (Malaysia demo). */
export const defaultBranchOffsetMinutes = 8 * 60;

/** Branch-local calendar date (yyyy-MM-dd) for `?day=` — fixed offset, not device TZ. */
export function branchCalendarYmd(serviceZoneOffsetMinutes: number): string {
  const off = Number.isFinite(serviceZoneOffsetMinutes) ? serviceZoneOffsetMinutes : 8 * 60;
  const shifted = new Date(Date.now() + off * 60_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Device local calendar yyyy-MM-dd (fallback when branch-local day returns no slots). */
export function deviceLocalCalendarYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Parse API DateTimeOffset strings; trims .NET "O" format fractional seconds beyond 3 digits for JS engines that reject them.
 */
export function parseApiDateTime(iso: string | undefined | null): Date | null {
  if (iso == null || iso === "") return null;
  let s = iso.trim();
  const re = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/i;
  const m = re.exec(s);
  if (m?.[2] && m[2].length > 4) {
    s = m[1] + m[2].slice(0, 4) + m[3];
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatSlotRange(slotStart: string, slotEnd: string, branchOffsetMinutes?: number): string {
  const a = parseApiDateTime(slotStart);
  const b = parseApiDateTime(slotEnd);
  if (!a || !b) return `${slotStart} – ${slotEnd}`;
  if (branchOffsetMinutes != null && Number.isFinite(branchOffsetMinutes)) {
    const ac = branchWallComponents(a, branchOffsetMinutes);
    const bc = branchWallComponents(b, branchOffsetMinutes);
    return `${pad2(ac.h)}:${pad2(ac.mi)} – ${pad2(bc.h)}:${pad2(bc.mi)}`;
  }
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${a.toLocaleTimeString([], opts)} – ${b.toLocaleTimeString([], opts)}`;
}

export function formatBookingSlotDateTime(slotStart: string, slotEnd: string, branchOffsetMinutes?: number): string {
  const a = parseApiDateTime(slotStart);
  const b = parseApiDateTime(slotEnd);
  if (!a || !b) return `${slotStart} – ${slotEnd}`;
  if (branchOffsetMinutes != null && Number.isFinite(branchOffsetMinutes)) {
    const ac = branchWallComponents(a, branchOffsetMinutes);
    const bc = branchWallComponents(b, branchOffsetMinutes);
    const da = new Date(Date.UTC(ac.y, ac.m0, ac.d, ac.h, ac.mi));
    const db = new Date(Date.UTC(bc.y, bc.m0, bc.d, bc.h, bc.mi));
    const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };
    return `${da.toLocaleString([], opts)} – ${db.toLocaleString([], opts)}`;
  }
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  return `${a.toLocaleString([], opts)} – ${b.toLocaleString([], opts)}`;
}

/** e.g. May 5, 2026 — branch wall date when offset passed */
export function formatBookingDateMedium(slotStart: string, branchOffsetMinutes?: number): string {
  const a = parseApiDateTime(slotStart);
  if (!a) return "";
  if (branchOffsetMinutes != null && Number.isFinite(branchOffsetMinutes)) {
    const w = branchWallComponents(a, branchOffsetMinutes);
    const d = new Date(Date.UTC(w.y, w.m0, w.d, w.h, w.mi));
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return a.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
