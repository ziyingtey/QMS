import type {
  ChannelAnalytics,
  CounterUtilizationRow,
  HourlyCount,
  LanePerformance,
  LiveDashboard,
  ManagerCounterRowDto,
  OperationalPeak,
  TicketStatusSummary,
  TimingSummary,
  WaitBucket,
} from "../api";
import { MGR_SVC_COLORS, counterModeKey, formatMinutesShort } from "./managerUtils";

export function TicketVolumeChart({ rows, peak }: { rows: HourlyCount[]; peak: OperationalPeak | null }) {
  if (rows.length === 0) return <p className="qgo-muted">No tickets issued today yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="qgo-mgr-hour-chart-wrap">
      {peak ? (
        <div className="qgo-mgr-peak-card">
          <strong>Peak: {peak.periodLabel}</strong>
          <span>{peak.ticketCount} tickets</span>
          {peak.aboveAveragePercent != null ? <span>+{Math.round(peak.aboveAveragePercent)}% vs hourly avg</span> : null}
          {peak.topServiceName ? <span>Top service: {peak.topServiceName}</span> : null}
          <span>
            Counters: {peak.activeCounters}/{peak.totalCounters} active
          </span>
        </div>
      ) : null}
      <div className="qgo-mgr-hour-chart" role="img" aria-label="Tickets issued by hour">
        {rows.map((row) => {
          const pct = (row.count / max) * 100;
          const hot = peak != null && row.count === peak.ticketCount;
          return (
            <div key={row.hourLabel} className="qgo-mgr-hour-col">
              <span className="qgo-mgr-hour-col__val">{row.count}</span>
              <div className="qgo-mgr-hour-col__bar-wrap">
                <div
                  className={`qgo-mgr-hour-col__bar${hot ? " qgo-mgr-hour-col__bar--hot" : ""}`}
                  style={{ height: `${Math.max(8, pct)}%` }}
                  title={`${row.hourLabel}: ${row.count}`}
                />
              </div>
              <span className="qgo-mgr-hour-col__label">{row.hourLabel.replace(":00", "")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimingSummaryStrip({ label, timing }: { label: string; timing: TimingSummary }) {
  return (
    <div className="qgo-mgr-timing-strip">
      <span className="qgo-mgr-timing-strip__label">{label}</span>
      <div className="qgo-mgr-timing-strip__vals">
        <div>
          <strong>{formatMinutesShort(timing.avgMinutes)}</strong>
          <span>Avg</span>
        </div>
        <div>
          <strong>{formatMinutesShort(timing.medianMinutes)}</strong>
          <span>Median</span>
        </div>
        <div>
          <strong>{formatMinutesShort(timing.longestMinutes)}</strong>
          <span>Longest</span>
        </div>
      </div>
    </div>
  );
}

export function TicketStatusStrip({ status }: { status: TicketStatusSummary }) {
  if (status.ticketsToday === 0) return <p className="qgo-muted">No tickets today.</p>;
  const items = [
    { key: "Served", val: status.served, tone: "green" },
    { key: "Waiting", val: status.waiting, tone: "blue" },
    { key: "Serving", val: status.serving, tone: "teal" },
    { key: "No-show", val: status.noShow, tone: "amber" },
    { key: "Cancelled", val: status.cancelled, tone: "muted" },
  ].filter((i) => i.val > 0);
  const servedPct = Math.round((status.served / status.ticketsToday) * 100);
  return (
    <div className="qgo-mgr-status-strip">
      <div className="qgo-mgr-status-strip__hero">
        <strong>{status.ticketsToday}</strong>
        <span className="qgo-muted">tickets · {servedPct}% served</span>
      </div>
      <ul className="qgo-mgr-status-strip__pills">
        {items.map((item) => (
          <li key={item.key} className={`qgo-mgr-status-pill qgo-mgr-status-pill--${item.tone}`}>
            <span>{item.key}</span>
            <strong>{item.val}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QueuePerformancePanel({ timing, buckets }: { timing: TimingSummary; buckets: WaitBucket[] }) {
  return (
    <div className="qgo-mgr-queue-panel">
      <div className="qgo-mgr-queue-panel__stats">
        <div><strong>{formatMinutesShort(timing.avgMinutes)}</strong><span>Avg</span></div>
        <div><strong>{formatMinutesShort(timing.medianMinutes)}</strong><span>Median</span></div>
        <div><strong>{formatMinutesShort(timing.longestMinutes)}</strong><span>Longest</span></div>
      </div>
      <TicketToCallDistributionChart buckets={buckets} />
    </div>
  );
}

export function ServicePerformanceTable({ lanes }: { lanes: LanePerformance[] }) {
  if (lanes.length === 0) return <p className="qgo-muted">No completed visits yet.</p>;
  const totalServed = lanes.reduce((s, l) => s + l.served, 0);
  const sorted = [...lanes].sort((a, b) => b.served - a.served);
  return (
    <div className="qgo-table-wrap qgo-table-wrap--card">
      <table className="qgo-table qgo-table--mgr qgo-table--analytics">
        <thead>
          <tr>
            <th>Service</th>
            <th>Share</th>
            <th>Served</th>
            <th>Ticket→call</th>
            <th>Service time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.serviceTypeId}>
              <td><span className="qgo-table__lane">{row.serviceName}</span></td>
              <td>{totalServed > 0 ? `${Math.round((row.served / totalServed) * 100)}%` : "—"}</td>
              <td><strong>{row.served}</strong></td>
              <td>{formatMinutesShort(row.avgTicketToCallMinutes)}</td>
              <td>{formatMinutesShort(row.avgServiceMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChannelCompareChart({
  walkIn,
  online,
  noShowsByHour = [],
}: {
  walkIn: ChannelAnalytics;
  online: ChannelAnalytics;
  noShowsByHour?: HourlyCount[];
}) {
  const total = walkIn.tickets + online.tickets;
  if (total === 0) return <p className="qgo-muted">No tickets issued today.</p>;
  const walkPct = Math.round((walkIn.tickets / total) * 100);
  const onlinePct = 100 - walkPct;
  const max = Math.max(walkIn.tickets, online.tickets, 1);
  const checkedIn = Math.max(0, online.tickets - online.noShows);
  return (
    <div className="qgo-mgr-channel-compare">
      <div className="qgo-mgr-source-split">
        <div className="qgo-mgr-source-row">
          <span>Walk-in · {walkPct}%</span>
          <div className="qgo-mgr-lane-bar__track">
            <div className="qgo-mgr-lane-bar__fill" style={{ width: `${(walkIn.tickets / max) * 100}%`, background: "#136fd8" }} />
          </div>
          <strong>{walkIn.tickets}</strong>
        </div>
        <div className="qgo-mgr-source-row">
          <span>Online · {onlinePct}%</span>
          <div className="qgo-mgr-lane-bar__track">
            <div className="qgo-mgr-lane-bar__fill" style={{ width: `${(online.tickets / max) * 100}%`, background: "#00b14f" }} />
          </div>
          <strong>{online.tickets}</strong>
        </div>
      </div>

      <div className="qgo-mgr-channel-grid">
        <div className="qgo-mgr-channel-card">
          <h4>Walk-in</h4>
          <dl className="qgo-mgr-channel-stats">
            <div><dt>Tickets</dt><dd>{walkIn.tickets}</dd></div>
            <div><dt>Served</dt><dd>{walkIn.served}</dd></div>
            <div><dt>Avg ticket→call</dt><dd>{walkIn.avgTicketToCallMinutes == null ? "—" : `${walkIn.avgTicketToCallMinutes}m`}</dd></div>
          </dl>
        </div>
        <div className="qgo-mgr-channel-card qgo-mgr-channel-card--online">
          <h4>Online booking performance</h4>
          <dl className="qgo-mgr-channel-stats">
            <div><dt>Bookings</dt><dd>{online.tickets}</dd></div>
            <div><dt>Checked-in</dt><dd>{checkedIn}</dd></div>
            <div><dt>No-show</dt><dd>{online.noShows}{online.noShowRatePercent != null ? ` (${online.noShowRatePercent}%)` : ""}</dd></div>
            <div><dt>Avg ticket→call</dt><dd>{online.avgTicketToCallMinutes == null ? "—" : `${online.avgTicketToCallMinutes}m`}</dd></div>
          </dl>
        </div>
      </div>

      {noShowsByHour.length > 0 ? (
        <div className="qgo-mgr-channel-drill">
          <h4>No-shows by hour (online)</h4>
          <NoShowByHourChart rows={noShowsByHour} compact />
        </div>
      ) : null}
    </div>
  );
}

export function TicketToCallDistributionChart({ buckets }: { buckets: WaitBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) return <p className="qgo-muted">Distribution appears after tickets are called.</p>;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div>
      <p className="qgo-mgr-chart-sub qgo-muted">How long tickets waited in queue before being called</p>
      <div className="qgo-bars qgo-bars--dist">
        {buckets.map((b, i) => (
          <div key={b.label} className="qgo-bar-row">
            <span className="qgo-bar-name">{b.label}</span>
            <div className="qgo-bar-track">
              <div className="qgo-bar-fill" style={{ width: `${(b.count / max) * 100}%`, background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length] }} />
            </div>
            <span className="qgo-bar-num">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CounterUtilizationChart({ rows }: { rows: CounterUtilizationRow[] }) {
  if (rows.length === 0) return <p className="qgo-muted">No counters configured.</p>;
  const max = 100;
  return (
    <ul className="qgo-mgr-util-list">
      {rows.map((r) => {
        const mode = counterModeKey(r.mode);
        const hot = r.utilizationPercent >= 85;
        const low = r.utilizationPercent > 0 && r.utilizationPercent < 30;
        return (
          <li key={r.counterId} className={`qgo-mgr-util-row${hot ? " qgo-mgr-util-row--hot" : ""}${low ? " qgo-mgr-util-row--low" : ""}`}>
            <div className="qgo-mgr-util-row__head">
              <strong>Counter {r.counterNumber}</strong>
              <span className={`qgo-mgr-util-row__mode qgo-mgr-util-row__mode--${mode}`}>{r.mode}</span>
            </div>
            <div className="qgo-mgr-util-row__bar-track">
              <div className="qgo-mgr-util-row__bar" style={{ width: `${(r.utilizationPercent / max) * 100}%` }} />
            </div>
            <div className="qgo-mgr-util-row__meta">
              <span>{r.utilizationPercent}% util</span>
              <span>{r.servedToday} served</span>
              <span className="qgo-muted">{r.staffEmail ?? "Unassigned"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NoShowByHourChart({ rows, compact = false }: { rows: HourlyCount[]; compact?: boolean }) {
  if (rows.length === 0) return <p className="qgo-muted">No no-shows recorded today.</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={`qgo-bars qgo-bars--dist${compact ? " qgo-bars--compact" : ""}`}>
      {rows.map((r, i) => (
        <div key={r.hourLabel} className="qgo-bar-row">
          <span className="qgo-bar-name">{r.hourLabel}</span>
          <div className="qgo-bar-track">
            <div className="qgo-bar-fill" style={{ width: `${(r.count / max) * 100}%`, background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length] }} />
          </div>
          <span className="qgo-bar-num">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export function CurrentQueueCard({ live, rows }: { live: LiveDashboard | null; rows: ManagerCounterRowDto[] }) {
  if (!live) return <p className="qgo-muted">—</p>;
  const open = rows.filter((r) => counterModeKey(r.mode) === "active").length;
  const brk = rows.filter((r) => counterModeKey(r.mode) === "break").length;
  const closed = rows.filter((r) => counterModeKey(r.mode) === "closed").length;
  const busiest = [...(live.byService ?? [])].sort((a, b) => b.queueLength - a.queueLength)[0];
  return (
    <div className="qgo-mgr-live-queue">
      <div className="qgo-mgr-live-queue__kpis">
        <div><strong>{live.queueLength}</strong><span>Waiting</span></div>
        <div><strong>{live.servingCount}</strong><span>Serving</span></div>
        <div><strong>{open}</strong><span>Active counters</span></div>
        <div><strong>{brk + closed}</strong><span>Unavailable</span></div>
      </div>
      {busiest && busiest.queueLength > 0 ? (
        <p className="qgo-mgr-live-queue__busiest">
          Longest queue: <strong>{busiest.queueLength}</strong> waiting
          {busiest.estimatedWaitMinutes != null ? ` · ~${Math.round(busiest.estimatedWaitMinutes)}m ETA` : ""}
        </p>
      ) : (
        <p className="qgo-muted">No customers waiting right now.</p>
      )}
    </div>
  );
}
