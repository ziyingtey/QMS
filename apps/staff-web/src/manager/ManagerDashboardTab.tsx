import { Users, Timer, MonitorCheck } from "lucide-react";
import type { AssignableStaffDto, BranchDto, LiveDashboard, ManagerCounterRowDto, ManagerInsights } from "../api";
import { KpiTile } from "../components/KpiTile";
import { EmptyState } from "../components/EmptyState";
import { ManagerAlertsPanel } from "./ManagerAlertsPanel";
import { ManagerCounterBoard } from "./ManagerCounterBoard";
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
      {/* Toolbar */}
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Branch overview</h1>
          <p className="qgo-muted">Real-time snapshot of queue and counter status</p>
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

      {/* Hero KPIs - the 3 most important numbers big */}
      {live ? (
        <>
          <div className="qgo-mgr-hero-row">
            <div className={`qgo-mgr-hero-card qgo-mgr-hero-card--${crowd?.level ?? "low"}`}>
              <Users size={22} strokeWidth={2} />
              <div className="qgo-mgr-hero-card__num">{live.queueLength}</div>
              <div className="qgo-mgr-hero-card__label">Waiting in queue</div>
            </div>
            <div className="qgo-mgr-hero-card qgo-mgr-hero-card--amber">
              <Timer size={22} strokeWidth={2} />
              <div className="qgo-mgr-hero-card__num">{live.avgTicketToCallMinutes}m</div>
              <div className="qgo-mgr-hero-card__label">Avg ticket-to-call</div>
            </div>
            <div className="qgo-mgr-hero-card qgo-mgr-hero-card--blue">
              <MonitorCheck size={22} strokeWidth={2} />
              <div className="qgo-mgr-hero-card__num">{live.servingCount}</div>
              <div className="qgo-mgr-hero-card__label">Now serving</div>
            </div>
          </div>

          {/* Secondary KPIs */}
          <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--secondary">
            <KpiTile variant="manager" label="Served today" value={live.customersServedToday} foot="Completed" accent="green" />
            <KpiTile variant="manager" label="Open counters" value={`${stats.open} / ${stats.total}`} foot={`${stats.break} on break`} accent="green" />
            <KpiTile variant="manager" label="Crowd level" value={crowd?.label ?? "—"} foot="Based on queue depth" accent="amber" />
            <KpiTile variant="manager" label="Online check-ins" value={live.onlineCheckInsWaiting} foot="Waiting to be called" accent="navy" />
          </div>
        </>
      ) : (
        <div className="qgo-mgr-loading-placeholder">
          <div className="qgo-mgr-loading-pulse" />
          <p className="qgo-muted">Loading live snapshot...</p>
        </div>
      )}

      {/* Main content grid */}
      <div className="qgo-mgr-dashboard__grid">
        {/* Left column */}
        <div className="qgo-mgr-dashboard__main">
          {/* Live queue by lane */}
          <section className="qgo-mgr-panel">
            <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
              <div>
                <h2>Queue by service lane</h2>
                <p className="qgo-muted">Where is demand concentrated?</p>
              </div>
              <span className="qgo-mgr-panel__meta">
                <strong>{live?.queueLength ?? 0}</strong> total waiting
              </span>
            </header>

            {laneRows.length === 0 ? (
              <div style={{ padding: "24px 20px" }}>
                <EmptyState icon="check" title="All clear" body="No customers waiting right now." />
              </div>
            ) : (
              <div className="qgo-mgr-lane-section">
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
                          {row.estimatedWaitMinutes != null ? ` · ~${row.estimatedWaitMinutes}m` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Alerts & Recommendations */}
          <section className="qgo-mgr-panel">
            <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
              <div>
                <h2>Alerts & recommendations</h2>
                <p className="qgo-muted">Issues and suggested actions</p>
              </div>
              {(insights?.alerts.length ?? 0) > 0 ? (
                <span className="qgo-mgr-badge-count">{insights!.alerts.length}</span>
              ) : null}
            </header>
            <ManagerAlertsPanel insights={insights} onGoToCounter={onGoToCounter} compact={false} />
          </section>
        </div>

        {/* Right column */}
        <div className="qgo-mgr-dashboard__side">
          <section className="qgo-mgr-panel">
            <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
              <div>
                <h2>Floor status</h2>
                <p className="qgo-muted">{stats.open} active · {stats.break} break · {stats.closed} closed</p>
              </div>
              <button type="button" className="qgo-link-btn qgo-mgr-link-action" onClick={onGoToCounters}>
                Manage
              </button>
            </header>
            <ManagerCounterBoard rows={rows} staffPickList={staffPickList} onSelect={onGoToCounter} />
          </section>
        </div>
      </div>
    </div>
  );
}
