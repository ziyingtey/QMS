import type { HourlyCount } from "../api";

/**
 * Shared chart theme for the Manager console (Dashboard + Analytics).
 * Colours mirror the brand / semantic tokens in styles/manager-tokens.css.
 * Every recharts style decision (colours, grid, axes, tooltip, sizes, number formats)
 * lives here so all charts look like one family.
 */

export const CHART = {
  accent: "#2563eb",
  /** Non-highlighted bars of the accent series. */
  accentSoft: "#c7d8fe",
  /** Mid tone (e.g. "serving" segment). */
  accentMid: "#60a5fa",
  /** Neutral series: "bad" counts such as missed tickets, comparison values. */
  neutral: "#94a3b8",
  /** Very quiet neutral: buckets beyond SLA, low emphasis. */
  neutralSoft: "#cbd5e1",
  /** Background track for progress bars and the bar hover cursor. */
  track: "#f1f5f9",
  grid: "#edf0f5",
  tick: "#64748b",
  text: "#0f172a",
  border: "#e4e8ef",
  status: {
    good: "#16a34a",
    warn: "#f59e0b",
    bad: "#ef4444",
    muted: "#94a3b8",
  },
  height: { main: 240, small: 160, spark: 40 },
  barSize: 28,
  radiusV: [4, 4, 0, 0] as [number, number, number, number],
  radiusH: [0, 4, 4, 0] as [number, number, number, number],
} as const;

/** Ticket outcome tones: one hue for "in progress / done", distinct tones for problems. */
export const STATUS_TONES = {
  served: CHART.accent,
  serving: CHART.accentMid,
  waiting: CHART.accentSoft,
  missed: CHART.status.warn,
  cancelled: CHART.neutral,
} as const;

/** Faint, horizontal-only gridlines (value axis only). */
export const gridProps = {
  vertical: false,
  stroke: CHART.grid,
  strokeDasharray: "3 3",
} as const;

export const xAxisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  minTickGap: 8,
  tick: { fontSize: 12, fill: CHART.tick },
} as const;

/** Fixed width instead of negative chart margins. */
export const yAxisProps = {
  tickLine: false,
  axisLine: false,
  width: 32,
  allowDecimals: false,
  tick: { fontSize: 12, fill: CHART.tick },
} as const;

export const chartMargin = { top: 8, right: 8, bottom: 0, left: 0 };

/** Soft column highlight, no outline, no animation (data refreshes often). */
export const tooltipProps = {
  cursor: { fill: CHART.track },
  wrapperStyle: { outline: "none" },
  isAnimationActive: false,
} as const;

/** "09:00" -> "9 AM" ("9a" when compact), "13:00" -> "1 PM". Falls back to the raw label. */
export function formatHourLabel(label: string, compact = false): string {
  const m = /^(\d{1,2}):00$/.exec(label.trim());
  if (!m) return label;
  const h = Number(m[1]);
  const h12 = h % 12 || 12;
  if (compact) return `${h12}${h >= 12 ? "p" : "a"}`;
  return `${h12} ${h >= 12 ? "PM" : "AM"}`;
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** Signed delta, e.g. "+12%". Used by the (currently hidden) KPI delta badge. */
export function formatDelta(v: number): string {
  return `${v > 0 ? "+" : ""}${Math.round(v)}%`;
}

/** Status tone for an SLA percentage (higher is better). */
export function slaTone(pct: number | null | undefined): "success" | "warning" | "danger" | "neutral" {
  if (pct == null) return "neutral";
  if (pct >= 90) return "success";
  if (pct >= 75) return "warning";
  return "danger";
}

/** Aligns sparse hourly rows (e.g. missed tickets) to the full list of hours, filling gaps with 0. */
export function alignHours(hours: string[], rows: HourlyCount[]): HourlyCount[] {
  const map = new Map(rows.map((r) => [r.hourLabel, r.count]));
  const all = Array.from(new Set([...hours, ...rows.map((r) => r.hourLabel)])).sort();
  return all.map((h) => ({ hourLabel: h, count: map.get(h) ?? 0 }));
}

/** Index of the busiest hour (first one on ties), or -1 when empty. */
export function peakIndex(rows: HourlyCount[]): number {
  if (rows.length === 0) return -1;
  return rows.reduce((best, r, i) => (r.count > rows[best].count ? i : best), 0);
}


/**
 * Pads hourly rows to a full business-day axis (default 9 AM–4 PM) with zero hours,
 * so a single busy hour still renders as one bar on a normal-looking day axis.
 * Hours outside the default range that carry data are kept. Unparseable labels are returned as-is.
 */
export function withBusinessHours(rows: HourlyCount[], fromHour = 9, toHour = 16): HourlyCount[] {
  const parse = (l: string) => {
    const m = /^(\d{1,2}):00$/.exec(l.trim());
    return m ? Number(m[1]) : null;
  };
  if (rows.some((r) => parse(r.hourLabel) == null)) return rows;
  const hours = rows.map((r) => parse(r.hourLabel) as number);
  const lo = Math.min(fromHour, ...hours);
  const hi = Math.max(toHour, ...hours);
  const map = new Map(hours.map((h, i) => [h, rows[i].count]));
  const out: HourlyCount[] = [];
  for (let h = lo; h <= hi; h++) out.push({ hourLabel: `${String(h).padStart(2, "0")}:00`, count: map.get(h) ?? 0 });
  return out;
}
