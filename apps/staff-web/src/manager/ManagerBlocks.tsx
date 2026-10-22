/**
 * Building blocks shared by Dashboard and Live Monitor:
 * lane list, counter tiles and the actionable alert list.
 */
import { useState } from "react";
import { AlertTriangle, ArrowRight, Info, Monitor, Moon, Plus, Power, UserX } from "lucide-react";
import type { AssignableStaffDto, BranchDto, ManagerCounterRowDto, ManagerInsights } from "../api";
import { Badge, Chips, EmptyBlock } from "./ui";
import { counterModeMeta, initialsOf, plural, waitTone, type LaneRow } from "./uiTones";
import { staffDisplayName } from "./managerUtils";

/* ── Lanes ────────────────────────────────────────────────────────────── */

export function LaneList({ lanes, onShowAll }: { lanes: LaneRow[]; onShowAll?: () => void }) {
  const [open, setOpen] = useState(false);
  const busy = lanes
    .filter((l) => l.waiting > 0 || l.serving > 0)
    .sort((a, b) => b.waiting - a.waiting || b.serving - a.serving);
  const idle = lanes.filter((l) => !(l.waiting > 0 || l.serving > 0));
  const maxWaiting = Math.max(1, ...busy.map((l) => l.waiting));

  if (lanes.length === 0) return <EmptyBlock title="No lanes yet" body="Add services to create lanes." />;
  if (busy.length === 0 && !open) {
    return (
      <EmptyBlock
        positive
        title="No one waiting"
        body={`${plural(lanes.length, "lane")}, all quiet`}
        action={onShowAll ? <button type="button" className="m-btn m-btn--link" onClick={onShowAll}>View lanes</button> : undefined}
      />
    );
  }

  const row = (l: LaneRow) => {
    const wait = l.longestMinutes ?? l.etaMinutes;
    const tone = l.breaches > 0 ? "danger" : waitTone(wait, l.slaMinutes);
    return (
      <li key={l.id} className="m-list__item m-lane">
        <span className={`m-token${l.waiting + l.serving === 0 ? " m-token--neutral" : ""}`}>{l.prefix ?? l.name.slice(0, 1)}</span>
        <span className="m-list__main">
          <span className="m-list__title">{l.name}</span>
          {/* One fact per row (the most urgent); the rest is in the tooltip. */}
          <span
            className="m-list__sub"
            title={[`${l.serving} serving`, wait != null && l.waiting > 0 ? `longest ${Math.round(wait)} min` : null, l.breaches > 0 ? `${l.breaches} waiting too long` : null].filter(Boolean).join(", ")}
          >
            {l.breaches > 0 ? (
              <span className="m-text-danger">{l.breaches} waiting too long</span>
            ) : wait != null && l.waiting > 0 ? (
              `Longest ${Math.round(wait)} min`
            ) : (
              `${l.serving} serving`
            )}
          </span>
          {l.waiting > 0 ? (
            <span className={`m-lane__bar m-lane__bar--${tone}`}>
              <span style={{ width: `${(l.waiting / maxWaiting) * 100}%` }} />
            </span>
          ) : null}
        </span>
        <span className="m-list__end m-lane__count">
          <strong>{l.waiting}</strong>
          <span>waiting</span>
        </span>
      </li>
    );
  };

  return (
    <ul className="m-list">
      {busy.map(row)}
      {open ? idle.map(row) : null}
      {idle.length > 0 ? (
        <li className="m-list__more">
          <span>{plural(idle.length, "idle lane")}</span>
          <button type="button" className="m-btn m-btn--link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide" : "Show"}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/* ── Counter tiles ────────────────────────────────────────────────────── */

function laneNames(r: ManagerCounterRowDto, branch: BranchDto | undefined): string[] {
  if (r.listenedQueueLabels && r.listenedQueueLabels.length > 0) return r.listenedQueueLabels;
  return (branch?.services ?? []).filter((s) => r.allowedServiceTypeIds.includes(s.id)).map((s) => s.name);
}

function rangeLabel(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  const contiguous = sorted.length > 2 && sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
  return contiguous ? `#${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.map((n) => `#${n}`).join(", ");
}

export function CounterTiles({
  rows,
  branch,
  staffPickList,
  onOpen,
}: {
  rows: ManagerCounterRowDto[];
  branch: BranchDto | undefined;
  staffPickList: AssignableStaffDto[];
  onOpen: (counterId: string) => void;
}) {
  if (rows.length === 0) return <EmptyBlock title="No counters yet" body="Add counters to start serving." />;
  const sorted = [...rows].sort((a, b) => a.number - b.number);
  // Many idle closed counters say nothing individually: fold them into one summary tile.
  const closedIdle = sorted.filter((r) => counterModeMeta(r.mode).key === "closed" && !r.assignedStaffEmail);
  const collapse = closedIdle.length >= 3;
  const shown = collapse ? sorted.filter((r) => !closedIdle.includes(r)) : sorted;
  // Best first counter to open: one that already serves at least one lane.
  const firstToOpen = closedIdle.find((r) => r.allowedServiceTypeIds.length > 0) ?? closedIdle[0];

  if (collapse && shown.length === 0) {
    return (
      <EmptyBlock
        icon={Monitor}
        title="All counters closed"
        body="Open one to start serving."
        action={
          <button type="button" className="m-btn m-btn--primary m-btn--sm" onClick={() => onOpen(firstToOpen.id)}>
            <Power size={14} aria-hidden /> Open counter
          </button>
        }
      />
    );
  }

  // Up to four tiles share the row evenly (no orphan tile); more counters flow into an auto grid.
  const slots = shown.length + (collapse ? 2 : 0);
  return (
    <div className="m-tiles-host">
    <div className={`m-tiles${slots <= 4 ? " m-tiles--few" : ""}`} style={{ ["--tile-slots" as string]: slots }}>
      {shown.map((r) => {
        const m = counterModeMeta(r.mode);
        const teller = r.assignedStaffEmail ? staffDisplayName(r, staffPickList) : null;
        const lanes = laneNames(r, branch);
        return (
          <button key={r.id} type="button" className={`m-tile m-tile--${m.key}`} onClick={() => onOpen(r.id)}>
            <span className="m-tile__top">
              <span className="m-tile__num">Counter {r.number}</span>
              <Badge tone={m.tone} dot size="sm">{m.label}</Badge>
            </span>
            <span className="m-tile__teller">
              {teller ? (
                <>
                  <span className="m-avatar m-avatar--sm" aria-hidden>{initialsOf(teller)}</span>
                  <span className="m-tile__name">{teller}</span>
                </>
              ) : (
                <>
                  <span className="m-avatar m-avatar--sm m-avatar--empty" aria-hidden><UserX size={12} /></span>
                  <span className="m-tile__name m-muted">No teller</span>
                </>
              )}
            </span>
            <span className="m-tile__lanes">
              <Chips items={lanes} max={2} empty={<span className="m-text-warning">No services</span>} />
            </span>
          </button>
        );
      })}
      {collapse ? (
        <div className="m-tile m-tile--summary">
          <span className="m-tile__top">
            <span className="m-tile__num">Counters {rangeLabel(closedIdle.map((r) => r.number))}</span>
            <Badge tone="neutral" dot size="sm">Closed</Badge>
          </span>
          <span className="m-muted m-tile__summary-text">
            {closedIdle.length} closed, no teller
          </span>
          <button type="button" className="m-btn m-btn--secondary m-btn--xs" onClick={() => onOpen(firstToOpen.id)}>
            <Plus size={12} aria-hidden /> Staff one
          </button>
        </div>
      ) : null}
    </div>
    </div>
  );
}

/* ── Alerts with direct actions ───────────────────────────────────────── */

/** True when the branch has counters but none is open or on break. */
function noCountersOpen(rows: ManagerCounterRowDto[]): boolean {
  return rows.length > 0 && rows.every((r) => counterModeMeta(r.mode).key === "closed");
}

type AlertItem = {
  key: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail?: string;
  actions: { label: string; icon?: typeof Power; primary?: boolean; disabled?: boolean; title?: string; run: () => void }[];
};

export function AlertList({
  insights,
  rows,
  busy,
  branchOpen,
  onGoToCounter,
  onGoToLive,
  onSetMode,
  onAllowedLaneToggle,
}: {
  insights: ManagerInsights | null;
  rows: ManagerCounterRowDto[];
  branch: BranchDto | undefined;
  busy: boolean;
  branchOpen: boolean;
  onGoToCounter: (id: string) => void;
  onGoToLive: () => void;
  onSetMode: (counterId: string, mode: "Active" | "Break" | "Closed") => void | Promise<void>;
  onAllowedLaneToggle: (counterId: string, laneId: string, checked: boolean) => void | Promise<void>;
}) {
  const items: AlertItem[] = [];

  (insights?.alerts ?? []).forEach((a, i) => {
    const sev = a.severity.toLowerCase();
    const tone: AlertItem["tone"] = sev === "critical" || sev === "error" ? "danger" : sev === "warning" ? "warning" : "info";
    // Messages often read "Lane: detail — suggestion"; split for a bold title + muted detail.
    const [head, ...rest] = a.message.split(/\s+—\s+/);
    const item: AlertItem = { key: `a${i}`, tone, title: head, detail: rest.join(" — ") || undefined, actions: [] };
    const counter = a.suggestedCounterNumber != null ? rows.find((r) => r.number === a.suggestedCounterNumber) : undefined;

    if (a.kind === "queue_pressure" && counter) {
      const svc = a.serviceTypeId ?? null;
      const hasLane = svc ? counter.allowedServiceTypeIds.includes(svc) : counter.allowedServiceTypeIds.length > 0;
      const isOpen = counterModeMeta(counter.mode).key === "active";
      if (a.suggestedAction === "add_service" && svc && !hasLane) {
        item.actions.push({
          label: `Add to counter ${counter.number}`,
          icon: Plus,
          primary: true,
          disabled: busy,
          run: () => void onAllowedLaneToggle(counter.id, svc, true),
        });
      } else if (!isOpen) {
        item.actions.push({
          label: `Open counter ${counter.number}`,
          icon: Power,
          primary: true,
          disabled: busy || !branchOpen || (!hasLane && !svc),
          title: !branchOpen ? "Branch is closed" : undefined,
          run: async () => {
            // Make sure the counter listens to the pressured lane before opening it.
            if (svc && !hasLane) await onAllowedLaneToggle(counter.id, svc, true);
            await onSetMode(counter.id, "Active");
          },
        });
      }
      item.actions.push({ label: "Review", run: () => onGoToCounter(counter.id) });
    } else if (a.kind === "queue_pressure") {
      item.actions.push({ label: "Live Monitor", run: onGoToLive });
    }
    // The action buttons already say what to do: drop the long suggestion text.
    if (item.actions.length > 0) item.detail = undefined;
    items.push(item);
  });

  // Derived from counters: open counters without a teller cannot call anyone.
  rows
    .filter((r) => counterModeMeta(r.mode).key === "active" && !r.assignedStaffEmail)
    .forEach((r) =>
      items.push({
        key: `t${r.id}`,
        tone: "warning",
        title: `Counter ${r.number} has no teller`,
        actions: [{ label: "Assign", primary: true, run: () => onGoToCounter(r.id) }],
      }),
    );

  // Derived: branch is open but no counter is open or on break, so nobody can be called.
  if (branchOpen && noCountersOpen(rows)) {
    const first = [...rows].sort((a, b) => a.number - b.number).find((r) => r.allowedServiceTypeIds.length > 0) ?? rows[0];
    items.unshift({
      key: "none-open",
      tone: "warning",
      title: "No counters open",
      detail: "No one can be called yet.",
      actions: [{ label: "Open counter", icon: Power, primary: true, run: () => onGoToCounter(first.id) }],
    });
  }

  if (items.length === 0) {
    return <EmptyBlock positive title="All clear" body="Nothing needs you now." />;
  }

  const ICON = { danger: AlertTriangle, warning: AlertTriangle, info: Info } as const;
  return (
    <ul className="m-alerts">
      {items.map((it) => {
        const Icon = it.tone === "info" && it.title.toLowerCase().includes("break") ? Moon : ICON[it.tone];
        return (
          <li key={it.key} className={`m-alert m-alert--${it.tone}`}>
            <span className="m-alert__icon"><Icon size={15} aria-hidden /></span>
            <div className="m-alert__body">
              <p className="m-alert__title">{it.title}</p>
              {it.detail ? <p className="m-alert__detail">{it.detail}</p> : null}
              {it.actions.length > 0 ? (
                <div className="m-alert__actions">
                  {it.actions.map((ac) => {
                    const AIcon = ac.icon;
                    return (
                      <button
                        key={ac.label}
                        type="button"
                        className={`m-btn m-btn--xs ${ac.primary ? "m-btn--primary" : "m-btn--secondary"}`}
                        disabled={ac.disabled}
                        title={ac.title}
                        onClick={ac.run}
                      >
                        {AIcon ? <AIcon size={12} aria-hidden /> : null}
                        {ac.label}
                        {!ac.primary && !AIcon ? <ArrowRight size={12} aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
