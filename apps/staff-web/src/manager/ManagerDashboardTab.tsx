import type { AssignableStaffDto, BranchDto, LiveDashboard, ManagerCounterRowDto, ManagerInsights } from "../api";
import { KpiTile } from "../components/KpiTile";
import { ManagerAlertsPanel } from "./ManagerAlertsPanel";
import { ManagerCounterBoard } from "./ManagerCounterBoard";
import { CurrentQueueCard } from "./ManagerAnalyticsCharts";
import { MGR_SVC_COLORS, counterStats, crowdFromQueue } from "./managerUtils";

type Props = {
  live: LiveDashboard | null;
  insights: ManagerInsights | null;
  rows: ManagerCounterRowDto[];
  branch: BranchDto | undefined;
  staffPickList: AssignableStaffDto[];
  branchOpenForOperations: boolean;
  onGoToCounter: (counterId: string) => void;
  onGoToCounters: () => void;
};

export function ManagerDashboardTab({
  live,
  insights,
  rows,
  branch,
  staffPickList,
  branchOpenForOperations,
  onGoToCounter,
  onGoToCounters,
}: Props) {
  const stats = counterStats(rows);
  const crowd = live ? crowdFromQueue(live.queueLength) : null;
  const laneRows = live?.byService ?? [];
  const maxQueue = Math.max(1, ...laneRows.map((r) => r.queueLength));

  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="qgo-mgr-dashboard">
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Branch overview</h1>
          <p className="qgo-muted">Is the branch operating normally right now?</p>
        </div>
        <div className="qgo-mgr-toolbar__right">
          <span className="qgo-live-pill">
            <span className="qgo-live-dot" /> Live · {now}
          </span>
          {!branchOpenForOperations ? (
            <span className="qgo-mgr-toolbar__chip qgo-mgr-toolbar__chip--warn">Outside operating hours</span>
          ) : null}
        </div>
      </header>

      {live ? (
        <div className="qgo-mgr-kpi-grid">
          <KpiTile variant="manager" label="Waiting" value={live.queueLength} foot="Customers in queue" accent="blue" />
          <KpiTile variant="manager" label="Est. ticket→call" value={`${live.avgTicketToCallMinutes}m`} foot="Today completed · not physical wait" accent="amber" />
          <KpiTile variant="manager" label="Now serving" value={live.servingCount} foot="At counters" accent="blue" />
          <KpiTile variant="manager" label="Served today" value={live.customersServedToday} foot="Completed" accent="green" />
          <KpiTile variant="manager" label="Open counters" value={stats.open} foot={`${stats.total} total`} accent="green" />
          <KpiTile variant="manager" label="Crowd" value={crowd?.label ?? "—"} foot="Queue depth view" accent="amber" />
          <KpiTile variant="manager" label="Online waiting" value={live.onlineCheckInsWaiting} foot="Checked-in online" accent="navy" />
        </div>
      ) : (
        <p className="qgo-muted">Loading live snapshot…</p>
      )}

      <div className="qgo-mgr-dashboard__grid">
        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
            <div>
              <h2>Current queue</h2>
              <p className="qgo-muted">What is happening right now</p>
            </div>
          </header>
          <CurrentQueueCard live={live} rows={rows} />
        </section>

        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
            <div>
              <h2>Live queue by lane</h2>
              <p className="qgo-muted">Where is demand concentrated?</p>
            </div>
            <span className="qgo-mgr-panel__meta">
              <strong>{live?.queueLength ?? 0}</strong> waiting
            </span>
          </header>

          {laneRows.length === 0 ? (
            <p className="qgo-muted">No customers waiting.</p>
          ) : (
            <>
              <div className="qgo-mgr-lane-bars">
                {laneRows.map((row, i) => {
                  const name = branch?.services.find((s) => s.id === row.serviceTypeId)?.name ?? row.serviceTypeId;
                  const pct = (row.queueLength / maxQueue) * 100;
                  return (
                    <div key={row.serviceTypeId} className="qgo-mgr-lane-bar">
                      <span className="qgo-mgr-lane-bar__name">{name}</span>
                      <div className="qgo-mgr-lane-bar__track">
                        <div
                          className="qgo-mgr-lane-bar__fill"
                          style={{ width: `${pct}%`, background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length] }}
                        />
                      </div>
                      <span className="qgo-mgr-lane-bar__val">
                        {row.queueLength}
                        {row.estimatedWaitMinutes != null ? ` · ${row.estimatedWaitMinutes}m` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="qgo-table-wrap qgo-table-wrap--card qgo-mgr-dash-table">
                <table className="qgo-table qgo-table--mgr">
                  <thead>
                    <tr>
                      <th>Lane</th>
                      <th>Waiting</th>
                      <th>ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laneRows.map((row) => {
                      const name = branch?.services.find((s) => s.id === row.serviceTypeId)?.name ?? row.serviceTypeId;
                      return (
                        <tr key={row.serviceTypeId}>
                          <td>
                            <span className="qgo-table__lane">{name}</span>
                          </td>
                          <td>{row.queueLength}</td>
                          <td>{row.estimatedWaitMinutes == null ? "—" : `${row.estimatedWaitMinutes} min`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="qgo-mgr-dashboard__side">
          <section className="qgo-mgr-panel">
            <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
              <div>
                <h2>Alerts</h2>
                <p className="qgo-muted">Problems that need attention</p>
              </div>
            </header>
            <ManagerAlertsPanel insights={insights} onGoToCounter={onGoToCounter} compact />
          </section>

          {(insights?.suggestions ?? []).length > 0 ? (
            <section className="qgo-mgr-panel qgo-mgr-panel--highlight">
              <header className="qgo-mgr-panel__head">
                <h2>Recommendations</h2>
                <p className="qgo-muted">Suggested actions (rule-based, not AI)</p>
              </header>
              <ul className="qgo-mgr-suggestions">
                {(insights?.suggestions ?? []).slice(0, 2).map((s) => (
                  <li key={`${s.kind}-${s.title}`} className="qgo-mgr-suggestion">
                    <div>
                      <strong>{s.title}</strong>
                      <p className="qgo-muted">{s.detail}</p>
                    </div>
                    {s.relatedCounterId ? (
                      <button
                        type="button"
                        className="qgo-btn-secondary qgo-btn-sm"
                        onClick={() => onGoToCounter(s.relatedCounterId!)}
                      >
                        Open counter
                      </button>
                    ) : (
                      <button type="button" className="qgo-btn-secondary qgo-btn-sm" onClick={onGoToCounters}>
                        Manage
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="qgo-mgr-panel">
            <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
              <div>
                <h2>Counters</h2>
                <p className="qgo-muted">Floor status at a glance</p>
              </div>
              <button type="button" className="qgo-link-btn qgo-mgr-link-action" onClick={onGoToCounters}>
                Manage →
              </button>
            </header>
            <ManagerCounterBoard rows={rows} staffPickList={staffPickList} onSelect={onGoToCounter} />
          </section>
        </div>
      </div>
    </div>
  );
}
