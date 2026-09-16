import type { ManagerAppointmentsToday } from "../api";
import { KpiTile } from "../components/KpiTile";
import { EmptyState } from "../components/EmptyState";

type Props = {
  data: ManagerAppointmentsToday | null;
};

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "confirmed") return "qgo-mgr-appt-pill qgo-mgr-appt-pill--blue";
  if (s === "checkedin" || s === "waiting") return "qgo-mgr-appt-pill qgo-mgr-appt-pill--green";
  if (s === "serving") return "qgo-mgr-appt-pill qgo-mgr-appt-pill--teal";
  if (s === "completed") return "qgo-mgr-appt-pill qgo-mgr-appt-pill--navy";
  if (s === "noshow") return "qgo-mgr-appt-pill qgo-mgr-appt-pill--amber";
  if (s === "cancelled") return "qgo-mgr-appt-pill qgo-mgr-appt-pill--muted";
  return "qgo-mgr-appt-pill";
}

export function ManagerAppointmentsTab({ data }: Props) {
  const completed = data
    ? data.totalBookings - data.confirmed - data.checkedIn - data.noShow - data.cancelled
    : 0;

  return (
    <div className="qgo-mgr-appointments">
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Appointments</h1>
          <p className="qgo-muted">Today&apos;s online bookings and check-in status.</p>
        </div>
      </header>

      {data ? (
        <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--compact">
          <KpiTile variant="manager" label="Total" value={data.totalBookings} accent="navy" />
          <KpiTile variant="manager" label="Confirmed" value={data.confirmed} accent="blue" />
          <KpiTile variant="manager" label="Checked in" value={data.checkedIn} accent="green" />
          <KpiTile variant="manager" label="Completed" value={completed} accent="green" />
          <KpiTile variant="manager" label="No-show" value={data.noShow} accent="amber" />
          <KpiTile variant="manager" label="Cancelled" value={data.cancelled} accent="blue" />
        </div>
      ) : (
        <p className="qgo-muted">Loading appointments…</p>
      )}

      <section className="qgo-mgr-panel">
        <header className="qgo-mgr-panel__head">
          <h2>Today&apos;s list</h2>
        </header>
        {!data || data.appointments.length === 0 ? (
          <div style={{ padding: "32px 20px" }}>
            <EmptyState icon="calendar" title="No appointments" body="No online bookings scheduled for today." />
          </div>
        ) : (
          <div className="qgo-table-wrap qgo-table-wrap--card">
            <table className="qgo-table qgo-table--mgr">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.appointments.map((a) => (
                  <tr key={a.bookingId}>
                    <td>
                      {formatSlotTime(a.slotStart)} – {formatSlotTime(a.slotEnd)}
                    </td>
                    <td>{a.customerName}</td>
                    <td>
                      <span className="qgo-table__lane">{a.serviceName}</span>
                    </td>
                    <td>
                      <span className={statusPillClass(a.status)}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
