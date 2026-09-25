import type { BranchQueueDto, LiveDashboard, ManagerCounterRowDto, ManagerWaitingTicket } from "../api";
import { KpiTile } from "../components/KpiTile";
import { ManagerCounterBoard } from "./ManagerCounterBoard";
import type { AssignableStaffDto } from "../api";

type Props = {
  live: LiveDashboard | null;
  waiting: ManagerWaitingTicket[];
  queues?: BranchQueueDto[];
  rows: ManagerCounterRowDto[];
  staffPickList: AssignableStaffDto[];
  onGoToCounter: (counterId: string) => void;
  onSelectWaiting?: () => void;
};

function formatMinutes(m: number): string {
  if (m < 1) return "<1m";
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function entryLabel(type: string): string {
  if (type === "WalkIn") return "Walk-in";
  if (type === "OnlineBooked") return "Online";
  return type;
}

function waitingSince(createdAt: string): string {
  const diff = (Date.now() - new Date(createdAt).getTime()) / 60_000;
  if (diff < 1) return "<1m";
  return `${Math.floor(diff)}m`;
}

export function ManagerLiveQueueTab({ live, waiting, queues = [], rows, staffPickList, onGoToCounter }: Props) {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="qgo-mgr-queue-page">
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Live queue</h1>
          <p className="qgo-muted">Whole-branch queue status and waiting customers.</p>
        </div>
        <span className="qgo-live-pill">
          <span className="qgo-live-dot" /> Live · {now}
        </span>
      </header>

      {queues.length > 0 ? (
        <section className="qgo-mgr-panel" style={{ marginBottom: 16 }}>
          <header className="qgo-mgr-panel__head">
            <h2>Service queues</h2>
            <p className="qgo-muted">Letter prefix · waiting count (档 B)</p>
          </header>
          <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--compact">
            {queues.map((q) => (
              <KpiTile
                key={q.id}
                variant="manager"
                label={`${q.ticketPrefix} · ${q.name}`}
                value={q.waitingCount}
                foot={
                  `SLA ${q.serviceLevelMinutes}m` +
                  (q.servingCount ? ` · ${q.servingCount} serving` : "") +
                  (q.longestWaitMinutes != null ? ` · longest ~${q.longestWaitMinutes}m` : "") +
                  (q.slaBreachCount > 0 ? ` · ${q.slaBreachCount} over` : "") +
                  (q.serviceNames?.length ? ` · ${q.serviceNames.join(", ")}` : "")
                }
                accent={q.slaBreachCount > 0 ? "amber" : "blue"}
              />
            ))}
          </div>
        </section>
      ) : null}

      {live ? (
        <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--compact">
          <KpiTile variant="manager" label="Waiting" value={live.queueLength} foot="In queue" accent="blue" />
          <KpiTile variant="manager" label="Serving" value={live.servingCount} foot="At counters" accent="green" />
          <KpiTile variant="manager" label="Est. ticket→call" value={`${live.avgTicketToCallMinutes}m`} foot="Today completed" accent="amber" />
          <KpiTile variant="manager" label="Longest" value={formatMinutes(live.longestTicketToCallMinutes)} foot="In queue now" accent="navy" />
        </div>
      ) : null}

      <div className="qgo-mgr-dashboard__grid">
        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
            <div>
              <h2>Waiting queue</h2>
              <p className="qgo-muted">Per-queue letter tickets · call order is longest-wait across queues</p>
            </div>
            <span className="qgo-mgr-panel__meta">
              <strong>{waiting.length}</strong> tickets
            </span>
          </header>

          {waiting.length === 0 ? (
            <p className="qgo-muted">No customers waiting right now.</p>
          ) : (
            <div className="qgo-table-wrap qgo-table-wrap--card">
              <table className="qgo-table qgo-table--mgr">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ticket</th>
                    <th>Service</th>
                    <th>Wait</th>
                    <th>ETA</th>
                    <th>Type</th>
                    <th>Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((t) => (
                    <tr key={t.ticketNumber}>
                      <td className="qgo-muted">{t.position}</td>
                      <td>
                        <strong className="qgo-table__ticket">{t.ticketNumber}</strong>
                      </td>
                      <td>
                        <span className="qgo-table__lane">{t.serviceName}</span>
                      </td>
                      <td>{waitingSince(t.createdAt)}</td>
                      <td>{t.estimatedWaitMinutes == null ? "—" : `~${Math.round(t.estimatedWaitMinutes)}m`}</td>
                      <td>{entryLabel(t.entryType)}</td>
                      <td>{t.checkedIn ? <span className="qgo-mgr-priority">Yes</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head">
            <h2>Counters</h2>
            <p className="qgo-muted">Serving status with current ticket</p>
          </header>
          <ManagerCounterBoard rows={rows} staffPickList={staffPickList} onSelect={onGoToCounter} />
        </section>
      </div>
    </div>
  );
}
