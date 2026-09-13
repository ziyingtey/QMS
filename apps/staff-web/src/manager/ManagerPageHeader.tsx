import type { LiveDashboard, ManagerCounterRowDto } from "../api";
import { counterStats, crowdFromQueue } from "./managerUtils";

type Props = {
  branchName?: string;
  live: LiveDashboard | null;
  rows: ManagerCounterRowDto[];
};

export function ManagerPageHeader({ branchName, live, rows }: Props) {
  const stats = counterStats(rows);
  const crowd = live ? crowdFromQueue(live.queueLength) : null;

  return (
    <header className="qgo-mgr-hero">
      <div className="qgo-mgr-hero__copy">
        <p className="qgo-mgr-hero__eyebrow">{branchName ?? "Branch"}</p>
        <h1>Operations command center</h1>
        <p className="qgo-mgr-hero__sub">
          Real-time floor control, capacity tuning, and lane performance — built for branch managers.
        </p>
      </div>
      <div className="qgo-mgr-hero__aside">
        <span className="qgo-mgr-hero__live">
          <span className="qgo-live-dot" aria-hidden />
          Live branch feed
        </span>
        {crowd ? (
          <span className={`qgo-mgr-crowd qgo-mgr-crowd--${crowd.level}`} title="Crowd level from queue depth">
            Crowd: {crowd.label}
          </span>
        ) : null}
        <div className="qgo-mgr-floor-stats" aria-label="Counter status summary">
          <div className="qgo-mgr-floor-stat qgo-mgr-floor-stat--open">
            <strong>{stats.open}</strong>
            <span>Open</span>
          </div>
          <div className="qgo-mgr-floor-stat qgo-mgr-floor-stat--break">
            <strong>{stats.break}</strong>
            <span>Break</span>
          </div>
          <div className="qgo-mgr-floor-stat qgo-mgr-floor-stat--closed">
            <strong>{stats.closed}</strong>
            <span>Closed</span>
          </div>
        </div>
      </div>
    </header>
  );
}
