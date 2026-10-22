import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ChannelAnalytics,
  CounterUtilizationRow,
  HourlyCount,
  LanePerformance,
  OperationalPeak,
  QueuePerformance,
  TicketStatusSummary,
  TimingSummary,
  WaitBucket,
} from "../api";
import { ChartTooltip } from "./ChartTooltip";
import {
  CHART,
  STATUS_TONES,
  chartMargin,
  formatDelta,
  formatHourLabel,
  formatPercent,
  gridProps,
  peakIndex,
  slaTone,
  tooltipProps,
  xAxisProps,
  withBusinessHours,
  yAxisProps,
} from "./chartTheme";
import { counterModeKey, formatMinutesShort } from "./managerUtils";
import { Badge, Card, Meter as UiMeter, Note, StatCard } from "./ui";
import type { Tone } from "./uiTones";

/* ── Building blocks ─────────────────────────────────────────────────────── */

type LegacyTone = "green" | "amber" | "red" | "blue" | "gray";
const LEGACY_TONE: Record<LegacyTone, Tone> = { green: "success", amber: "warning", red: "danger", blue: "info", gray: "neutral" };

/** Status as a soft-tinted badge with a dot (accepts semantic or legacy colour names). */
export function StatusDot({ tone, children }: { tone: Tone | LegacyTone; children: ReactNode }) {
  const t = (LEGACY_TONE as Record<string, Tone>)[tone] ?? (tone as Tone);
  return (
    <Badge tone={t} dot>
      {children}
    </Badge>
  );
}

/** Analytics card = the design-system Card with an optional headline figure. */
export function ChartCard({
  title,
  subtitle,
  figure,
  figureLabel,
  className = "",
  children,
  flush = false,
  compact = false,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  figure?: ReactNode;
  figureLabel?: string;
  className?: string;
  children: ReactNode;
  /** Render children without body padding (tables). */
  flush?: boolean;
  /** Short body for sparse data: content is vertically centred and the card does not force chart height. */
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <Card
      className={className}
      title={title}
      description={subtitle}
      figure={figure}
      figureLabel={figureLabel}
      action={action}
      flush={flush}
      center={compact}
    >
      {children}
    </Card>
  );
}

/**
 * Delta badge for KPI cards. `invert` = lower is better (wait time, missed rate).
 * Not rendered today: the analytics API has no previous-period values yet.
 */
export function KpiDelta({ value, invert = false }: { value: number; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  const tone: Tone = value === 0 ? "neutral" : good ? "success" : "danger";
  return <Badge tone={tone}>{formatDelta(value)}</Badge>;
}

/** KPI card with an optional visual (sparkline / meter) and optional delta. */
export function AnalyticsKpi({
  label,
  value,
  unit,
  foot,
  hint,
  visual,
  delta,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  foot?: ReactNode;
  hint?: ReactNode;
  visual?: ReactNode;
  delta?: { value: number; invert?: boolean } | null;
}) {
  return (
    <StatCard
      label={label}
      value={value}
      unit={unit}
      empty={value === "—"}
      badge={delta ? <KpiDelta value={delta.value} invert={delta.invert} /> : undefined}
      visual={visual}
      context={foot}
      hint={hint}
    />
  );
}

/** Tiny bar sparkline (no axes, grid or tooltip). */
export function SparkBars({ values, color = CHART.accent }: { values: number[]; color?: string }) {
  if (values.length === 0 || values.every((v) => v === 0)) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={88} height={CHART.height.spark}>
      <BarChart data={data} margin={{ top: 1, right: 0, bottom: 1, left: 0 }} barCategoryGap={2}>
        <XAxis dataKey="i" hide />
        <YAxis hide domain={[0, "dataMax"]} />
        <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Thin 0–100 meter (design-system meter). */
export function Meter({ percent }: { percent: number; color?: string }) {
  return <UiMeter percent={percent} />;
}

/** Row of small stats (Avg / Median / Longest …). */
export function StatRow({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="m-kv">
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Compact one-line message for cards without enough data for a chart. */
export function CompactNote({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <Note hint={hint} action={action}>
      {children}
    </Note>
  );
}

/* ── Demand ──────────────────────────────────────────────────────────────── */

export function TicketVolumeChart({ rows, peak }: { rows: HourlyCount[]; peak: OperationalPeak | null }) {
  if (rows.length === 0 || rows.every((r) => r.count === 0)) {
    return <CompactNote>No tickets yet</CompactNote>;
  }
  const activeHours = rows.filter((r) => r.count > 0).length;
  rows = withBusinessHours(rows);
  const pi = peakIndex(rows);
  // Average of the hours that had tickets; with a single hour it would just repeat the bar.
  const avg = activeHours >= 2 ? rows.reduce((s, r) => s + r.count, 0) / activeHours : null;
  const data = rows.map((r, i) => ({
    hour: formatHourLabel(r.hourLabel),
    count: r.count,
    isPeak: i === pi,
    tone: i === pi ? CHART.accent : CHART.accentSoft,
  }));

  return (
    // Fills the card height (the card spans two grid rows); never shorter than CHART.height.main.
    <div className="m-chart" style={{ minHeight: CHART.height.main }}>
      <div className="m-chart__abs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={chartMargin}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="hour" {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip
            {...tooltipProps}
            content={(p) => (
              <ChartTooltip
                {...p}
                unit=" tickets"
                extra={(d) => (d.isPeak && Number(d.count) > 0 ? [peak?.topServiceName ? `Busiest: ${peak.topServiceName}` : "Busiest hour"] : [])}
              />
            )}
          />
          {avg != null ? (
            <ReferenceLine
              y={avg}
              stroke={CHART.neutral}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: `Avg ${Math.round(avg)}`, position: "insideTopRight", fontSize: 12, fill: CHART.tick }}
            />
          ) : null}
          <Bar
            dataKey="count"
            name="Tickets"
            maxBarSize={CHART.barSize + 12}
            radius={CHART.radiusV}
            isAnimationActive={false}
            shape={(props) => {
              const tone = (props.payload as { tone?: string } | undefined)?.tone ?? CHART.accentSoft;
              return <Rectangle {...props} fill={tone} />;
            }}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Missed tickets (called, no response) by call hour, on the same hours as the demand chart. */
export function MissedByHourChart({ rows }: { rows: HourlyCount[] }) {
  if (rows.length === 0 || rows.every((r) => r.count === 0)) {
    return <CompactNote>None missed today</CompactNote>;
  }
  const data = withBusinessHours(rows).map((r) => ({ hour: formatHourLabel(r.hourLabel, true), count: r.count }));
  return (
    <ResponsiveContainer width="100%" height={CHART.height.small}>
      <BarChart data={data} margin={chartMargin}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="hour" {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip {...tooltipProps} content={(p) => <ChartTooltip {...p} unit=" missed" />} />
        <Bar dataKey="count" name="Missed" fill={CHART.neutral} maxBarSize={CHART.barSize} radius={CHART.radiusV} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Channel mix ─────────────────────────────────────────────────────────── */

export function ChannelSplit({ walkIn, online }: { walkIn: ChannelAnalytics; online: ChannelAnalytics }) {
  const total = walkIn.tickets + online.tickets;
  if (total === 0) return <CompactNote>No tickets yet</CompactNote>;
  const walkPct = Math.round((walkIn.tickets / total) * 100);
  const onlinePct = 100 - walkPct;
  // noShows / noShowRatePercent are Missed tickets (called, no response).
  const missedRate = (c: ChannelAnalytics) =>
    c.noShowRatePercent != null ? c.noShowRatePercent : c.tickets > 0 ? (c.noShows / c.tickets) * 100 : null;
  // A channel with no tickets shows "—" rather than zeros and empty rates.
  const cell = (c: ChannelAnalytics) =>
    c.tickets === 0
      ? { tickets: 0, served: "—", wait: "—", missed: "—" }
      : {
          tickets: c.tickets,
          served: c.served,
          wait: c.avgTicketToCallMinutes == null || c.served === 0 ? "—" : formatMinutesShort(c.avgTicketToCallMinutes),
          missed: c.noShows > 0 ? `${c.noShows} (${formatPercent(missedRate(c), 1)})` : "0",
        };
  const w = cell(walkIn);
  const o = cell(online);
  // Rows where both channels have nothing to say are dropped (no table of zeros and dashes).
  const blank = (v: string | number) => v === "—" || v === 0 || v === "0";
  const detailRows = [
    { label: "Served", w: w.served, o: o.served },
    { label: "Avg. wait", w: w.wait, o: o.wait },
    { label: "Missed", w: w.missed, o: o.missed },
  ].filter((r) => !(blank(r.w) && blank(r.o)));

  return (
    <div className="m-stack">
      <div className="m-segbar" aria-label={`Walk-in ${walkPct}%, online ${onlinePct}%`}>
        {walkIn.tickets > 0 ? <span style={{ width: `${walkPct}%`, background: CHART.accent }} /> : null}
        {online.tickets > 0 ? <span style={{ width: `${onlinePct}%`, background: CHART.accentSoft }} /> : null}
      </div>
      <ul className="m-legend">
        <li><span className="m-legend__dot" style={{ background: CHART.accent }} />Walk-in <strong>{walkPct}%</strong></li>
        <li><span className="m-legend__dot" style={{ background: CHART.accentSoft }} />Online <strong>{onlinePct}%</strong></li>
      </ul>
      {detailRows.length > 0 ? (
        <table className="m-mini-table">
          <thead>
            <tr><th /><th className="m-num">Walk-in</th><th className="m-num">Online</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Tickets</th><td className="m-num">{w.tickets}</td><td className="m-num">{o.tickets}</td></tr>
            {detailRows.map((r) => (
              <tr key={r.label}><th scope="row">{r.label}</th><td className="m-num">{r.w}</td><td className="m-num">{r.o}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <CompactNote hint="More detail after the first visit.">
          {walkIn.tickets} walk-in, {online.tickets} online
        </CompactNote>
      )}
    </div>
  );
}

/* ── Waiting ─────────────────────────────────────────────────────────────── */

export function WaitDistributionChart({ buckets, timing }: { buckets: WaitBucket[]; timing: TimingSummary }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <CompactNote hint="Shows after the first visit.">No waits yet</CompactNote>
    );
  }
  const slaTotal = (timing.slaMetCount ?? 0) + (timing.slaExceededCount ?? 0);

  // Each lane has its own target, so a bucket can hold both: split each bar into within / over target.
  // Older APIs send no overTarget, then the bars are not split and the legend is hidden.
  const hasSplit = buckets.some((b) => b.overTarget != null);
  const data = buckets.map((b) => {
    const over = Math.min(b.count, b.overTarget ?? 0);
    return {
      label: b.label.replace(/\s*min$/i, ""),
      count: b.count,
      within: b.count - over,
      over,
      share: Math.round((b.count / total) * 100),
    };
  });

  return (
    <div className="m-stack">
      <StatRow
        items={[
          { label: "Average", value: formatMinutesShort(timing.avgMinutes) },
          { label: "Median", value: formatMinutesShort(timing.medianMinutes) },
          { label: "Longest", value: formatMinutesShort(timing.longestMinutes) },
          {
            label: "Within target",
            value: timing.slaMetCount != null && slaTotal > 0 ? `${timing.slaMetCount} / ${slaTotal}` : "—",
          },
        ]}
      />
      <ResponsiveContainer width="100%" height={CHART.height.small + 40}>
        <BarChart data={data} margin={chartMargin}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip
            {...tooltipProps}
            content={(p) => <ChartTooltip {...p} unit=" tickets" extra={(d) => [`${d.share}% of tickets`]} />}
          />
          {hasSplit ? (
            <>
              <Bar dataKey="within" name="Within target" stackId="wait" fill={CHART.accent} maxBarSize={CHART.barSize + 20} isAnimationActive={false} />
              <Bar dataKey="over" name="Over target" stackId="wait" fill={CHART.neutralSoft} maxBarSize={CHART.barSize + 20} radius={CHART.radiusV} isAnimationActive={false} />
            </>
          ) : (
            <Bar dataKey="count" name="Tickets" fill={CHART.accent} maxBarSize={CHART.barSize + 20} radius={CHART.radiusV} isAnimationActive={false} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {hasSplit ? (
        <ul className="m-legend">
          <li><span className="m-legend__dot" style={{ background: CHART.accent }} />Within target</li>
          <li><span className="m-legend__dot" style={{ background: CHART.neutralSoft }} />Over target</li>
        </ul>
      ) : null}
    </div>
  );
}

/* ── Outcomes ────────────────────────────────────────────────────────────── */

export function TicketStatusStrip({ status, service }: { status: TicketStatusSummary; service: TimingSummary }) {
  if (status.ticketsToday === 0) return <CompactNote>No tickets yet</CompactNote>;

  const items = [
    { key: "Served", val: status.served, color: STATUS_TONES.served },
    { key: "Serving", val: status.serving, color: STATUS_TONES.serving },
    { key: "Waiting", val: status.waiting, color: STATUS_TONES.waiting },
    { key: "Missed", val: status.noShow, color: STATUS_TONES.missed },
    { key: "Cancelled", val: status.cancelled, color: STATUS_TONES.cancelled },
  ];
  // Only rows with a count: keeps the legend short on quiet days.
  const visible = items.filter((i) => i.val > 0);
  const pct = (v: number) => Math.round((v / status.ticketsToday) * 100);
  const inProgress = status.waiting + status.serving;

  return (
    <div className="m-stack">
      <div className="m-outcome__hero">
        {status.served > 0 ? (
          <>
            <strong>{pct(status.served)}%</strong>
            <span>served</span>
          </>
        ) : (
          <>
            <strong>{inProgress}</strong>
            <span>in progress</span>
          </>
        )}
      </div>
      <div className="m-segbar m-segbar--lg">
        {visible.map((item) => (
          <span
            key={item.key}
            style={{ width: `${(item.val / status.ticketsToday) * 100}%`, background: item.color }}
            title={`${item.key}: ${item.val}`}
          />
        ))}
      </div>
      <ul className="m-outcome__list">
        {visible.map((item) => (
          <li key={item.key}>
            <span className="m-legend__dot" style={{ background: item.color }} />
            <span className="m-outcome__name">{item.key}</span>
            <strong>{item.val}</strong>
            <span className="m-outcome__pct">{pct(item.val)}%</span>
          </li>
        ))}
      </ul>
      <div className="m-stack m-stack--sm m-divider-top">
        <span className="m-eyebrow">Service time</span>
        {status.served > 0 ? (
          <StatRow
            items={[
              { label: "Average", value: formatMinutesShort(service.avgMinutes) },
              { label: "Median", value: formatMinutesShort(service.medianMinutes) },
              { label: "Longest", value: formatMinutesShort(service.longestMinutes) },
            ]}
          />
        ) : (
          <span className="m-note__hint">Shows after the first visit.</span>
        )}
      </div>
    </div>
  );
}

/* ── Tables ──────────────────────────────────────────────────────────────── */

/** Muted footer row that collapses inactive rows behind a Show / Hide toggle. */
function CollapsedRow({
  colSpan,
  count,
  noun,
  open,
  onToggle,
}: {
  colSpan: number;
  count: number;
  noun: string;
  open: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <tr className="m-table__more">
      <td colSpan={colSpan}>
        <span className="m-table__more-inner">
        <span>{count} idle {noun}</span>
        <button type="button" className="m-btn m-btn--link" onClick={onToggle} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </button>
        </span>
      </td>
    </tr>
  );
}

/** Live queue activity keyed by lower-cased name, used to flag services that have tickets but no completed visits. */
export type QueueActivityByName = Map<string, { waiting: number; serving: number }>;

export function ServicePerformanceTable({
  lanes,
  queueActivity,
}: {
  lanes: LanePerformance[];
  queueActivity?: QueueActivityByName;
}) {
  const [showAll, setShowAll] = useState(false);
  if (lanes.length === 0) return <CompactNote>No services</CompactNote>;

  const live = (l: LanePerformance) => queueActivity?.get(l.serviceName.trim().toLowerCase());
  const isActive = (l: LanePerformance) => {
    const q = live(l);
    return l.served > 0 || (q != null && (q.waiting > 0 || q.serving > 0));
  };
  const totalServed = lanes.reduce((s, l) => s + l.served, 0);
  const maxServed = Math.max(...lanes.map((l) => l.served), 1);
  const byServed = (a: LanePerformance, b: LanePerformance) => b.served - a.served || a.serviceName.localeCompare(b.serviceName);
  const active = lanes.filter(isActive).sort(byServed);
  const idle = lanes.filter((l) => !isActive(l)).sort(byServed);

  if (active.length === 0 && !showAll) {
    return (
      <CompactNote
        hint={`${lanes.length} services, all idle`}
        action={<button type="button" className="m-btn m-btn--link" onClick={() => setShowAll(true)}>Show all</button>}
      >
        No activity yet
      </CompactNote>
    );
  }

  // Before the first completed visit every metric column is "—": show live activity only.
  if (totalServed === 0) {
    const liveRow = (r: LanePerformance, muted: boolean) => {
      const q = live(r);
      return (
        <tr key={r.serviceTypeId} className={muted ? "is-muted" : undefined}>
          <td data-label="Service" className="m-cell-main">{r.serviceName}</td>
          <td data-label="Serving" className="m-num">{q?.serving ? <span className="m-strong">{q.serving}</span> : <span className="m-subtle">0</span>}</td>
          <td data-label="Waiting" className="m-num">{q?.waiting ? <span className="m-strong">{q.waiting}</span> : <span className="m-subtle">0</span>}</td>
          <td data-label="Status" className="m-subtle">In progress</td>
        </tr>
      );
    };
    return (
      <div className="m-table-wrap">
        <table className="m-table">
          <thead>
            <tr>
              <th>Service</th>
              <th className="m-num">Serving</th>
              <th className="m-num">Waiting</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {active.map((r) => liveRow(r, false))}
            {showAll ? idle.map((r) => liveRow(r, true)) : null}
            <CollapsedRow colSpan={4} count={idle.length} noun={idle.length === 1 ? "service" : "services"} open={showAll} onToggle={() => setShowAll((v) => !v)} />
          </tbody>
        </table>
      </div>
    );
  }

  const row = (r: LanePerformance, muted: boolean) => {
    const q = live(r);
    const note = r.served === 0 && q && (q.waiting > 0 || q.serving > 0) ? `${q.serving} serving` : null;
    return (
      <tr key={r.serviceTypeId} className={muted ? "is-muted" : undefined}>
        <td data-label="Service" className="m-cell-main">
          {r.serviceName}
          {note ? <span className="m-cell-sub">{note}</span> : null}
        </td>
        <td data-label="Served">
          <span className="m-inline-bar">
            <span className="m-inline-bar__track">
              <span className="m-inline-bar__fill" style={{ width: `${(r.served / maxServed) * 100}%` }} />
            </span>
            <span className="m-num">{r.served}</span>
          </span>
        </td>
        <td data-label="Share" className="m-num">{totalServed > 0 && r.served > 0 ? `${Math.round((r.served / totalServed) * 100)}%` : "—"}</td>
        <td data-label="Avg. wait" className="m-num">{r.served > 0 ? formatMinutesShort(r.avgTicketToCallMinutes) : "—"}</td>
        <td data-label="Max wait" className="m-num">{r.served > 0 ? formatMinutesShort(r.maxTicketToCallMinutes) : "—"}</td>
        <td data-label="Avg. service" className="m-num">{r.served > 0 ? formatMinutesShort(r.avgServiceMinutes) : "—"}</td>
        <td data-label="Within target">
          {r.ticketToCallSlaPercent == null || r.served === 0 ? (
            <span className="m-subtle">—</span>
          ) : (
            <StatusDot tone={slaTone(r.ticketToCallSlaPercent)}>{formatPercent(r.ticketToCallSlaPercent)}</StatusDot>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="m-table-wrap">
      <table className="m-table">
        <thead>
          <tr>
            <th>Service</th>
            <th className="m-bar-col">Served</th>
            <th className="m-num">Share</th>
            <th className="m-num">Avg. wait</th>
            <th className="m-num">Longest</th>
            <th className="m-num">Service time</th>
            <th>Within target</th>
          </tr>
        </thead>
        <tbody>
          {active.map((r) => row(r, false))}
          {showAll ? idle.map((r) => row(r, true)) : null}
          <CollapsedRow colSpan={7} count={idle.length} noun={idle.length === 1 ? "service" : "services"} open={showAll} onToggle={() => setShowAll((v) => !v)} />
        </tbody>
      </table>
    </div>
  );
}

export function QueuePerformanceTable({ rows }: { rows: QueuePerformance[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!rows?.length) return <CompactNote>No lanes</CompactNote>;

  const isActive = (r: QueuePerformance) => r.waiting > 0 || r.serving > 0 || r.servedToday > 0;
  const active = rows.filter(isActive);
  const idle = rows.filter((r) => !isActive(r));

  if (active.length === 0 && !showAll) {
    return (
      <CompactNote
        hint={`${rows.length} lanes, all idle`}
        action={<button type="button" className="m-btn m-btn--link" onClick={() => setShowAll(true)}>Show all</button>}
      >
        No activity yet
      </CompactNote>
    );
  }

  const row = (r: QueuePerformance, muted: boolean) => (
    <tr key={r.queueId} className={muted ? "is-muted" : undefined}>
      <td data-label="Lane" className="m-cell-main">
        <span className="m-cell-flex"><span className="m-token">{r.ticketPrefix}</span> {r.name}</span>
      </td>
      <td data-label="Waiting" className="m-num">{r.waiting}</td>
      <td data-label="Serving" className="m-num">{r.serving}</td>
      <td data-label="Served" className="m-num">{r.servedToday}</td>
      <td data-label="Avg. wait" className="m-num">{r.servedToday > 0 ? formatMinutesShort(r.avgTicketToCallMinutes) : "—"}</td>
      <td data-label="Target" className="m-num">{r.serviceLevelMinutes} min</td>
      <td data-label="Too long">
        {r.slaBreachWaiting > 0 ? (
          <StatusDot tone="red">{r.slaBreachWaiting} waiting too long</StatusDot>
        ) : r.waiting > 0 ? (
          <StatusDot tone="green">OK</StatusDot>
        ) : (
          <span className="m-subtle">—</span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="m-table-wrap">
      <table className="m-table">
        <thead>
          <tr>
            <th>Lane</th>
            <th className="m-num">Waiting</th>
            <th className="m-num">Serving</th>
            <th className="m-num">Served</th>
            <th className="m-num">Avg. wait</th>
            <th className="m-num">Target</th>
            <th>Too long</th>
          </tr>
        </thead>
        <tbody>
          {active.map((r) => row(r, false))}
          {showAll ? idle.map((r) => row(r, true)) : null}
          <CollapsedRow colSpan={7} count={idle.length} noun={idle.length === 1 ? "lane" : "lanes"} open={showAll} onToggle={() => setShowAll((v) => !v)} />
        </tbody>
      </table>
    </div>
  );
}

/* ── Staffing ────────────────────────────────────────────────────────────── */

const MODE_TONE = { active: "green", break: "amber", closed: "gray" } as const;
const MODE_LABEL = { active: "Open", break: "Break", closed: "Closed" } as const;
const MODE_ORDER = { active: 0, break: 1, closed: 2 } as const;

export function CounterUtilizationList({ rows }: { rows: CounterUtilizationRow[] }) {
  const [showClosed, setShowClosed] = useState(false);
  if (rows.length === 0) return <CompactNote>No counters</CompactNote>;

  // Active first, then Break, then Closed; by counter number within each group.
  const sorted = [...rows].sort(
    (a, b) => MODE_ORDER[counterModeKey(a.mode)] - MODE_ORDER[counterModeKey(b.mode)] || a.counterNumber - b.counterNumber,
  );
  // Closed counters that served nobody today carry no information: collapse them.
  const isIdleClosed = (r: CounterUtilizationRow) => counterModeKey(r.mode) === "closed" && r.servedToday === 0;
  const shown = sorted.filter((r) => !isIdleClosed(r));
  const idleClosed = sorted.filter(isIdleClosed);

  const item = (r: CounterUtilizationRow) => {
    const mode = counterModeKey(r.mode);
    const pct = Math.max(0, Math.min(100, r.utilizationPercent));
    const load =
      // No serving time yet (closed, or open but idle so far): a load label would be noise.
      pct === 0 && r.servedToday === 0
        ? null
        : pct >= 85
          ? { tone: "amber" as const, text: "High" }
          : pct < 30
            ? { tone: "gray" as const, text: "Low" }
            : { tone: "green" as const, text: "Normal" };
    return (
      <tr key={r.counterId} className={mode === "closed" ? "is-muted" : undefined}>
        <td>
          <span className="m-cell-main">Counter {r.counterNumber}</span>
          <span className="m-cell-sub">{r.staffEmail ?? "No teller"}</span>
        </td>
        <td><StatusDot tone={MODE_TONE[mode]}>{MODE_LABEL[mode]}</StatusDot></td>
        <td>
          <span className="m-inline-bar">
            <span className="m-inline-bar__track"><span className="m-inline-bar__fill" style={{ width: `${pct}%` }} /></span>
            <span className="m-num">{Math.round(pct)}%</span>
          </span>
        </td>
        <td className="m-num">{r.servedToday}</td>
        <td>{load ? <StatusDot tone={load.tone}>{load.text}</StatusDot> : <span className="m-subtle">—</span>}</td>
      </tr>
    );
  };

  const closedNumbers = idleClosed.map((r) => r.counterNumber);
  const closedLabel =
    closedNumbers.length > 2 && closedNumbers[closedNumbers.length - 1] - closedNumbers[0] === closedNumbers.length - 1
      ? `#${closedNumbers[0]}–${closedNumbers[closedNumbers.length - 1]}`
      : closedNumbers.map((n) => `#${n}`).join(", ");

  // Every counter closed and idle: one line instead of a header-only table.
  if (shown.length === 0 && !showClosed) {
    return (
      <CompactNote
        hint={`${idleClosed.length} closed (${closedLabel})`}
        action={<button type="button" className="m-btn m-btn--link" onClick={() => setShowClosed(true)}>Show</button>}
      >
        No counters open
      </CompactNote>
    );
  }

  return (
    <div className="m-table-wrap">
      <table className="m-table">
        <thead>
          <tr>
            <th>Counter</th>
            <th>Status</th>
            <th className="m-bar-col">Utilization</th>
            <th className="m-num">Served</th>
            <th>Load</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(item)}
          {showClosed ? idleClosed.map(item) : null}
          {idleClosed.length > 0 ? (
            <tr className="m-table__more">
              <td colSpan={5}>
                <span className="m-table__more-inner">
                  <span>
                    {idleClosed.length} closed {idleClosed.length === 1 ? "counter" : "counters"} ({closedLabel})
                  </span>
                  <button type="button" className="m-btn m-btn--link" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
                    {showClosed ? "Hide" : "Show"}
                  </button>
                </span>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ── Dashboard: queue today (area chart, shadcn "chart-area-interactive" style) ── */

export function QueueTodayChart({ rows, unit, color = CHART.accent }: { rows: HourlyCount[]; unit: string; color?: string }) {
  const activeHours = rows.filter((r) => r.count > 0).length;
  // Bars get the full business-day axis; the area chart keeps real hours only (padding future hours with 0 would fake a drop).
  const data = (activeHours < 3 ? withBusinessHours(rows) : rows).map((r) => ({ hour: formatHourLabel(r.hourLabel), count: r.count }));
  const name = unit.trim().replace(/^./, (c) => c.toUpperCase());
  // A line through one or two points reads as broken: use bars until the day has some shape.
  if (activeHours < 3) {
    return (
      <div className="m-chart" style={{ minHeight: CHART.height.main }}>
        <div className="m-chart__abs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={chartMargin}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hour" {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip {...tooltipProps} content={(p) => <ChartTooltip {...p} unit={unit} />} />
              <Bar dataKey="count" name={name} fill={color} maxBarSize={CHART.barSize + 12} radius={CHART.radiusV} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  const gid = `qt-fill-${color.replace("#", "")}`;
  return (
    <div className="m-chart" style={{ minHeight: CHART.height.main }}>
      <div className="m-chart__abs">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="hour" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip
              {...tooltipProps}
              cursor={{ stroke: CHART.neutralSoft, strokeDasharray: "3 3" }}
              content={(p) => <ChartTooltip {...p} unit={unit} />}
            />
            <Area
              type="monotone"
              dataKey="count"
              name={name}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gid})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: color }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
