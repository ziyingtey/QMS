/** Semantic tone helpers shared by manager pages (kept out of ui.tsx for react-refresh). */
import type { BranchQueueDto, ManagerInsights } from "../api";
import { counterModeKey } from "./managerUtils";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet";

/** Counter mode → label + tone. "Active" reads as "Open" to managers. */
export function counterModeMeta(mode: string): { key: "active" | "break" | "closed"; label: string; tone: Tone } {
  const key = counterModeKey(mode);
  if (key === "active") return { key, label: "Open", tone: "success" };
  if (key === "break") return { key, label: "Break", tone: "warning" };
  return { key, label: "Closed", tone: "neutral" };
}

/** Wait (minutes) against an SLA target → tone. */
export function waitTone(minutes: number | null | undefined, slaMinutes: number): Tone {
  if (minutes == null) return "neutral";
  if (minutes >= slaMinutes) return "danger";
  if (minutes >= slaMinutes * 0.75) return "warning";
  return "success";
}

/** Initials for an avatar from a name or email. */
export function initialsOf(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return "?";
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0].replace(/[._+-]+/g, " ") : nameOrEmail;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "12:05" style clock (24h) for a Date / ISO string. */
export function clockTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Compact slot window: "2:00 – 2:30 PM" (meridiem shown once when shared). */
export function slotRange(start: string, end?: string | null): string {
  const a = clockTime(start);
  if (!end) return a;
  const b = clockTime(end);
  const ma = /\s?(AM|PM)$/i.exec(a);
  const mb = /\s?(AM|PM)$/i.exec(b);
  if (ma && mb && ma[1] === mb[1]) return `${a.slice(0, ma.index)} – ${b}`;
  return `${a} – ${b}`;
}

/** Minutes elapsed since an ISO timestamp (never negative). */
export function minutesSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now - t) / 60_000);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ── Lanes ── */

export type LaneRow = {
  id: string;
  prefix: string | null;
  name: string;
  waiting: number;
  serving: number;
  longestMinutes: number | null;
  etaMinutes: number | null;
  slaMinutes: number;
  breaches: number;
  active: boolean;
};

/** Normalises queues (preferred) or insight lanes into one row shape. */
export function lanesFrom(queues: BranchQueueDto[], insights: ManagerInsights | null): LaneRow[] {
  if (queues.length > 0) {
    return queues.map((q) => ({
      id: q.id,
      prefix: q.ticketPrefix,
      name: q.name,
      waiting: q.waitingCount ?? 0,
      serving: q.servingCount ?? 0,
      longestMinutes: q.longestWaitMinutes,
      etaMinutes: null,
      slaMinutes: q.serviceLevelMinutes,
      breaches: q.slaBreachCount ?? 0,
      active: q.isActive,
    }));
  }
  return (insights?.lanes ?? []).map((l) => ({
    id: l.serviceTypeId,
    prefix: null,
    name: l.serviceName,
    waiting: l.waitingCount,
    serving: 0,
    longestMinutes: null,
    etaMinutes: l.estimatedWaitMinutes,
    slaMinutes: 15,
    breaches: 0,
    active: true,
  }));
}

