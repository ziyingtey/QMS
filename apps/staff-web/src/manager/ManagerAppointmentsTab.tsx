import type { ManagerAppointmentsToday } from "../api";
import { KpiTile } from "../components/KpiTile";
import { MGR_SVC_COLORS } from "./managerUtils";

type Props = {
  data: ManagerAppointmentsToday | null;
};

export function ManagerAppointmentsTab({ data }: Props) {
  const s = data?.statusCounts;
  const slots = data?.slotsByHour ?? [];
  const maxSlot = Math.max(1, ...slots.map((x) => x.count));

  return (
    <div className="qgo-mgr-appointments">
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Appointments</h1>
          <p className="qgo-muted">Today&apos;s online bookings and check-in status.</p>
        </div>
      </header>

      {s ? (
        <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--compact">
          <KpiTile variant="manager" label="Confirmed" value={s.confirmed} accent="blue" />
          <KpiTile variant="manager" label="Checked in" value={s.checkedIn} accent="green" />
          <KpiTile variant="manager" label="Waiting" value={s.waiting} accent="amber" />
          <KpiTile variant="manager" label="Serving" value={s.serving} accent="navy" />
          <KpiTile variant="manager" label="Completed" value={s.completed} accent="green" />
          <KpiTile variant="manager" label="No-show" value={s.noShow} accent="amber" />
          <KpiTile variant="manager" label="Cancelled" value={s.cancelled} accent="blue" />
        </div>
      ) : (
        <p className="qgo-muted">Loading appointments…</p>
      )}

      <div className="qgo-mgr-dashboard__grid">
        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head">
            <h2>Bookings by hour</h2>
            <p className="qgo-muted">Peak slots stand out in red when &gt; 10</p>
          </header>
          {slots.length === 0 ? (
            <p className="qgo-muted">No appointments scheduled for today.</p>
          ) : (
            <div className="qgo-mgr-slot-bars">
              {slots.map((slot, i) => {
                const pct = (slot.count / maxSlot) * 100;
                const hot = slot.count >= 10;
                return (
                  <div key={slot.hourLabel} className="qgo-mgr-lane-bar">
                    <span className="qgo-mgr-lane-bar__name">{slot.hourLabel}</span>
                    <div className="qgo-mgr-lane-bar__track">
                      <div
                        className={`qgo-mgr-lane-bar__fill${hot ? " qgo-mgr-lane-bar__fill--hot" : ""}`}
                        style={{ width: `${pct}%`, background: hot ? "#d42e1c" : MGR_SVC_COLORS[i % MGR_SVC_COLORS.length] }}
                      />
                    </div>
                    <span className="qgo-mgr-lane-bar__val">
                      {slot.count}
                      {hot ? " 🔴" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head">
            <h2>Today&apos;s list</h2>
          </header>
          {!data || data.appointments.length === 0 ? (
            <p className="qgo-muted">No appointment rows.</p>
          ) : (
            <div className="qgo-table-wrap qgo-table-wrap--card">
              <table className="qgo-table qgo-table--mgr">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {data.appointments.map((a, i) => (
                    <tr key={`${a.time}-${a.serviceName}-${i}`}>
                      <td>{a.time}</td>
                      <td>{a.serviceName}</td>
                      <td>{a.status}</td>
                      <td>{a.ticketNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
