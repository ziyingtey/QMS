import { useState } from "react";
import { Link } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { CurrentCustomerPanel } from "../../components/CurrentCustomerPanel";
import { EmptyState } from "../../components/EmptyState";
import { KpiTile } from "../../components/KpiTile";
import { StatusPill } from "../../components/StatusPill";
import { useToast } from "../../context/ToastContext";
import { MOCK_LIVE, MOCK_MY_COUNTER, MOCK_WAITING } from "../../preview/mockData";

type Variant = "idle" | "serving" | "not-assigned";

export function PreviewStaffPage({ variant = "idle" }: { variant?: Variant }) {
  const { toast } = useToast();
  const [ticket, setTicket] = useState(variant === "serving" ? "A014" : "");
  const [servingActive, setServingActive] = useState(variant === "serving");
  const myCounter = variant === "not-assigned" ? null : MOCK_MY_COUNTER;
  const live = MOCK_LIVE;
  const waiting = MOCK_WAITING;
  const serviceName = "Personal Banking";
  const counterActive = myCounter?.mode.toLowerCase() === "active";
  const lanesConfigured = (myCounter?.allowedServiceTypeIds.length ?? 0) > 0;
  const canCallNext = Boolean(lanesConfigured && counterActive && !ticket);

  const noopLogout = () => toast("Preview mode — no logout", "info");

  if (variant === "not-assigned") {
    return (
      <div className="qgo-shell">
        <div className="qgo-preview-banner">
          UI Preview · mock data · <Link to="/preview">Back to gallery</Link>
        </div>
        <AppTopBar variant="staff" email="staff.teller@local.test" role="Staff" live={false} onLogout={noopLogout} />
        <div className="qgo-blocked">
          <EmptyState
            title="No counter assigned"
            body="Your branch manager must assign you to a counter before you can serve customers."
            icon="!"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="qgo-shell qgo-shell--staff">
      <div className="qgo-preview-banner">
        UI Preview · mock data · buttons are visual only · <Link to="/preview">Gallery</Link>
      </div>
      <AppTopBar variant="staff" email="staff.teller@local.test" role="Staff" onLogout={noopLogout} />

      <div className="qgo-staff-hero">
        <div>
          <p className="qgo-staff-hero__eyebrow">{myCounter!.branchName}</p>
          <h1 className="qgo-staff-hero__title">Counter {myCounter!.counterNumber}</h1>
          <p className="qgo-staff-hero__lane">{myCounter!.serviceLaneName}</p>
        </div>
        <StatusPill mode={myCounter!.mode} size="md" />
      </div>

      <div className="qgo-kpi-row">
        <KpiTile label="Served today" value={live.customersServedToday} foot="Branch total" accent="green" />
        <KpiTile label="In queue" value={live.queueLength} foot="All lanes" accent="blue" />
        <KpiTile label="Avg ticket→call" value={`${live.avgTicketToCallMinutes}m`} foot="Today completed" accent="amber" />
        <KpiTile label="In branch" value={live.customersInBranch} foot={`${live.activeCounters} active counters`} accent="navy" />
      </div>

      <div className="qgo-staff-grid">
        <CurrentCustomerPanel
          ticket={ticket}
          servingActive={servingActive}
          serviceName={serviceName}
          waitingCount={waiting.length}
          busy={false}
          canCallNext={canCallNext}
          onCallNext={() => {
            setTicket("A014");
            setServingActive(true);
            toast("Preview: called A014", "success");
          }}
          onComplete={() => {
            toast("Preview: service completed", "success");
            setTicket("");
            setServingActive(false);
          }}
          onNoShow={() => {
            toast("Marked as no-show — ticket cleared", "info");
            setTicket("");
            setServingActive(false);
          }}
          onStart={() => {
            setServingActive(true);
            toast("Preview: service started", "success");
          }}
        />

        <aside className="qgo-panel qgo-panel--queue">
          <header className="qgo-panel__head qgo-panel__head--split">
            <h2>Queue</h2>
            <span className="qgo-muted">{waiting.length} waiting</span>
          </header>
          <p className="qgo-lane-note">
            Lane: <strong>{serviceName}</strong>
          </p>
          <ul className="qgo-queue-list">
            {waiting.map((w) => (
              <li key={w.ticketNumber} className="qgo-queue-item">
                <span className="qgo-queue-pos">{w.position}</span>
                <div className="qgo-queue-main">
                  <strong>{w.ticketNumber}</strong>
                  <span className="qgo-muted">{w.entryType}</span>
                </div>
                <span className="qgo-queue-eta">{w.estimatedWaitMinutes}m</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
