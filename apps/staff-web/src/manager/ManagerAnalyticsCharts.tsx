import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
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
  if (rows.length === 0) return <p className="qgo-muted" style={{ padding: "20px" }}>No tickets issued today yet.</p>;

  const data = rows.map((r) => ({
    hour: r.hourLabel.replace(":00", ""),
    count: r.count,
    isPeak: peak != null && r.count === peak.ticketCount,
  }));

  return (
    <div className="qgo-mgr-chart-container">
      {peak ? (
        <div className="qgo-mgr-peak-card">
          <strong>Peak: {peak.periodLabel}</strong>
          <span>{peak.ticketCount} tickets</span>
          {peak.aboveAveragePercent != null ? <span>+{Math.round(peak.aboveAveragePercent)}% vs avg</span> : null}
          {peak.topServiceName ? <span>Top: {peak.topServiceName}</span> : null}
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
            formatter={(value) => [String(value), "Tickets"]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((entry) => (
              <Cell key={entry.hour} fill={entry.isPeak ? "#f09800" : "#136fd8"} fillOpacity={entry.isPeak ? 1 : 0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TimingSummaryStrip({ label, timing }: { label: string; timing: TimingSummary }) {
  return (
    <div className="qgo-mgr-timing-strip">
      <span className="qgo-mgr-timing-strip__label">{label}</span>
      <div className="qgo-mgr-timing-strip__vals">
        <div><strong>{formatMinutesShort(timing.avgMinutes)}</strong><span>Avg</span></div>
        <div><strong>{formatMinutesShort(timing.medianMinutes)}</strong><span>Median</span></div>
        <div><strong>{formatMinutesShort(timing.longestMinutes)}</strong><span>Longest</span></div>
      </div>
    </div>
  );
}

export function TicketStatusStrip({ status }: { status: TicketStatusSummary }) {
  if (status.ticketsToday === 0) return <p className="qgo-muted" style={{ padding: "16px 20px" }}>No tickets today.</p>;

  const items = [
    { key: "Served", val: status.served, color: "#00b14f" },
    { key: "Waiting", val: status.waiting, color: "#136fd8" },
    { key: "Serving", val: status.serving, color: "#17b5a6" },
    { key: "No-show", val: status.noShow, color: "#f09800" },
    { key: "Cancelled", val: status.cancelled, color: "#94a3b8" },
  ].filter((i) => i.val > 0);

  const servedPct = Math.round((status.served / status.ticketsToday) * 100);

  return (
    <div className="qgo-mgr-status-strip">
      <div className="qgo-mgr-status-strip__hero">
        <strong>{status.ticketsToday}</strong>
        <span className="qgo-muted">tickets · {servedPct}% served</span>
      </div>
      <div className="qgo-mgr-status-bar">
        {items.map((item) => (
          <div
            key={item.key}
            className="qgo-mgr-status-bar__seg"
            style={{ width: `${(item.val / status.ticketsToday) * 100}%`, background: item.color }}
            title={`${item.key}: ${item.val}`}
          />
        ))}
      </div>
      <ul className="qgo-mgr-status-strip__pills">
        {items.map((item) => (
          <li key={item.key} className="qgo-mgr-status-pill">
            <span className="qgo-mgr-status-pill__dot" style={{ background: item.color }} />
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
  if (lanes.length === 0) return <p className="qgo-muted" style={{ padding: "16px 20px" }}>No completed visits yet.</p>;
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
  if (total === 0) return <p className="qgo-muted" style={{ padding: "16px 20px" }}>No tickets issued today.</p>;
  const walkPct = Math.round((walkIn.tickets / total) * 100);
  const onlinePct = 100 - walkPct;
  const checkedIn = Math.max(0, online.tickets - online.noShows);

  const pieData = [
    { name: "Walk-in", value: walkIn.tickets, fill: "#136fd8" },
    { name: "Online", value: online.tickets, fill: "#00b14f" },
  ].filter((d) => d.value > 0);

  return (
    <div className="qgo-mgr-channel-compare">
      <div className="qgo-mgr-channel-top">
        <div className="qgo-mgr-channel-pie">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} strokeWidth={2}>
                {pieData.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
              <Legend verticalAlign="bottom" height={24} iconType="circle" iconSize={8}
                formatter={(value: string) => <span style={{ fontSize: 12, color: "#64748b" }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="qgo-mgr-channel-grid">
          <div className="qgo-mgr-channel-card">
            <h4>Walk-in <span className="qgo-mgr-channel-card__pct">{walkPct}%</span></h4>
            <dl className="qgo-mgr-channel-stats">
              <div><dt>Tickets</dt><dd>{walkIn.tickets}</dd></div>
              <div><dt>Served</dt><dd>{walkIn.served}</dd></div>
              <div><dt>Avg ticket→call</dt><dd>{walkIn.avgTicketToCallMinutes == null ? "—" : `${walkIn.avgTicketToCallMinutes}m`}</dd></div>
            </dl>
          </div>
          <div className="qgo-mgr-channel-card qgo-mgr-channel-card--online">
            <h4>Online <span className="qgo-mgr-channel-card__pct">{onlinePct}%</span></h4>
            <dl className="qgo-mgr-channel-stats">
              <div><dt>Bookings</dt><dd>{online.tickets}</dd></div>
              <div><dt>Checked-in</dt><dd>{checkedIn}</dd></div>
              <div><dt>No-show</dt><dd>{online.noShows}{online.noShowRatePercent != null ? ` (${online.noShowRatePercent}%)` : ""}</dd></div>
              <div><dt>Avg ticket→call</dt><dd>{online.avgTicketToCallMinutes == null ? "—" : `${online.avgTicketToCallMinutes}m`}</dd></div>
            </dl>
          </div>
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
  if (total === 0) return <p className="qgo-muted" style={{ padding: "12px 0" }}>Distribution appears after tickets are called.</p>;

  const data = buckets.map((b, i) => ({
    label: b.label,
    count: b.count,
    fill: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length],
  }));

  return (
    <div>
      <p className="qgo-mgr-chart-sub qgo-muted">How long tickets waited before being called</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((d) => <Cell key={d.label} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CounterUtilizationChart({ rows }: { rows: CounterUtilizationRow[] }) {
  if (rows.length === 0) return <p className="qgo-muted" style={{ padding: "16px 20px" }}>No counters configured.</p>;

  const data = rows.map((r) => ({
    name: `#${r.counterNumber}`,
    utilization: r.utilizationPercent,
    served: r.servedToday,
    mode: r.mode,
    staff: r.staffEmail ?? "Unassigned",
  }));

  return (
    <div className="qgo-mgr-util-chart">
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
            formatter={(value, _name, props) => {
              const p = (props as { payload?: { served?: number; staff?: string } }).payload;
              return [`${value}% · ${p?.served ?? 0} served · ${p?.staff ?? ""}`, "Utilization"];
            }}
          />
          <Bar dataKey="utilization" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {data.map((d) => {
              const color = d.utilization >= 85 ? "#f09800" : d.utilization < 30 && d.utilization > 0 ? "#94a3b8" : "#00b14f";
              return <Cell key={d.name} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NoShowByHourChart({ rows, compact = false }: { rows: HourlyCount[]; compact?: boolean }) {
  if (rows.length === 0) return <p className="qgo-muted" style={{ padding: "12px 20px" }}>No no-shows recorded today.</p>;

  const data = rows.map((r) => ({ hour: r.hourLabel.replace(":00", ""), count: r.count }));

  return (
    <ResponsiveContainer width="100%" height={compact ? 120 : 180}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Bar dataKey="count" fill="#f09800" radius={[3, 3, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
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
        <p className="qgo-muted" style={{ padding: "8px 16px" }}>No customers waiting right now.</p>
      )}
    </div>
  );
}

export function QueuePerformanceTable({
  rows,
}: {
  rows: {
    queueId: string;
    name: string;
    ticketPrefix: string;
    waiting: number;
    serving: number;
    servedToday: number;
    avgTicketToCallMinutes: number | null;
    slaBreachWaiting: number;
    serviceLevelMinutes: number;
  }[];
}) {
  if (!rows?.length) {
    return <p className="qgo-muted" style={{ padding: "8px 16px" }}>No queue data yet — restart API after 档 B provisioning.</p>;
  }
  return (
    <div className="qgo-table-wrap qgo-table-wrap--card">
      <table className="qgo-table qgo-table--mgr">
        <thead>
          <tr>
            <th>Queue</th>
            <th>Waiting</th>
            <th>Serving</th>
            <th>Served</th>
            <th>Avg ticket→call</th>
            <th>SLA</th>
            <th>Over SLA now</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.queueId}>
              <td>
                <strong>{r.ticketPrefix}</strong> · {r.name}
              </td>
              <td>{r.waiting}</td>
              <td>{r.serving}</td>
              <td>{r.servedToday}</td>
              <td>{r.avgTicketToCallMinutes == null ? "—" : `${r.avgTicketToCallMinutes}m`}</td>
              <td>{r.serviceLevelMinutes}m</td>
              <td>{r.slaBreachWaiting > 0 ? <span className="qgo-mgr-priority">{r.slaBreachWaiting}</span> : "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
