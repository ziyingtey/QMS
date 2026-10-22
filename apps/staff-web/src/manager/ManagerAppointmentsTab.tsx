import { useState } from "react";
import { ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, UserX } from "lucide-react";
import type { ManagerAppointmentsToday } from "../api";
import { Badge, Card, EmptyBlock, PageHeader, PageSkeleton, Segmented, StatCard } from "./ui";
import { clockTime, initialsOf, type Tone } from "./uiTones";
import type { ManagerTab } from "./managerNav";

type Props = {
  data: ManagerAppointmentsToday | null;
  onGoToTab?: (tab: ManagerTab) => void;
};

// "missed" group = No-show (never checked in), Missed (checked in, called, no reply) and Cancelled.
type Group = "upcoming" | "arrived" | "done" | "missed";
type Filter = "all" | Group;

const STATUS_META: Record<string, { label: string; tone: Tone; group: Group }> = {
  confirmed: { label: "Upcoming", tone: "info", group: "upcoming" },
  checkedin: { label: "Checked in", tone: "success", group: "arrived" },
  waiting: { label: "Waiting", tone: "success", group: "arrived" },
  serving: { label: "Serving", tone: "violet", group: "arrived" },
  completed: { label: "Completed", tone: "neutral", group: "done" },
  noshow: { label: "No-show", tone: "warning", group: "missed" },
  missed: { label: "Missed", tone: "danger", group: "missed" },
  cancelled: { label: "Cancelled", tone: "neutral", group: "missed" },
};

function metaOf(status: string) {
  return STATUS_META[status.toLowerCase()] ?? { label: status, tone: "neutral" as Tone, group: "upcoming" as Group };
}

/** Appointments: "How are today's bookings going, and who is next?" */
export function ManagerAppointmentsTab({ data, onGoToTab }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  // Captured once per mount; the list re-renders on every data refresh anyway.
  const [now] = useState(() => Date.now());

  if (!data) {
    return (
      <>
        <PageHeader title="Appointments" description="Loading today's bookings…" />
        <PageSkeleton />
      </>
    );
  }

  // Total = upcoming + checked in + completed + missed group (no-show, missed, cancelled).
  const missedCalls = data.missed ?? 0;
  const missedTotal = data.noShow + missedCalls + data.cancelled;
  const missedLine = [
    data.noShow > 0 ? `${data.noShow} no-show` : null,
    missedCalls > 0 ? `${missedCalls} missed` : null,
    data.cancelled > 0 ? `${data.cancelled} cancelled` : null,
  ].filter(Boolean).join(", ");
  const completed = Math.max(0, data.totalBookings - data.confirmed - data.checkedIn - missedTotal);
  const list = [...data.appointments].sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const next = list.find((a) => metaOf(a.status).group === "upcoming" && new Date(a.slotEnd).getTime() >= now) ?? list.find((a) => metaOf(a.status).group === "upcoming");
  const count = (g: Group) => list.filter((a) => metaOf(a.status).group === g).length;
  const shown = filter === "all" ? list : list.filter((a) => metaOf(a.status).group === filter);
  const resolved = completed + data.noShow;
  const showRate = resolved > 0 ? Math.round((completed / resolved) * 100) : null;


  return (
    <>
      <PageHeader
        title="Appointments"
        description={
          data.totalBookings === 0 ? (
            "No bookings today"
          ) : next ? (
            <>
              Next at <strong>{clockTime(next.slotStart)}</strong>
            </>
          ) : (
            "All guests have arrived"
          )
        }
      />

      <div className="m-stats">
        <StatCard
          label="Booked today"
          icon={CalendarCheck}
          value={data.totalBookings}
          context={data.totalBookings === 0 ? "None yet" : `${data.confirmed} to arrive`}
        />
        <StatCard
          label="Checked in"
          icon={CalendarClock}
          value={data.checkedIn}
          badge={data.checkedIn > 0 ? <Badge tone="success" dot>Here</Badge> : undefined}
          context={data.checkedIn === 0 ? "No one yet" : "In the branch"}
        />
        <StatCard
          label="Completed"
          icon={CheckCircle2}
          value={completed}
          badge={showRate != null ? <Badge tone={showRate >= 85 ? "success" : "warning"} dot>{showRate}% came</Badge> : undefined}
          context={completed === 0 ? "None yet" : "Visits done"}
        />
        <StatCard
          label="Missed"
          icon={UserX}
          value={missedTotal}
          context={missedTotal === 0 ? "None today" : missedLine}
        />
      </div>

      <Card
        title="Today's bookings"
        action={
          list.length === 0 ? undefined : (
          <Segmented<Filter>
            label="Filter bookings"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: list.length },
              { value: "upcoming", label: "Upcoming", count: count("upcoming") },
              { value: "arrived", label: "Checked in", count: count("arrived") },
              { value: "done", label: "Completed", count: count("done") },
              { value: "missed", label: "Missed", count: count("missed") },
            ]}
          />
          )
        }
        flush
      >
        {shown.length === 0 ? (
          list.length === 0 ? (
            <EmptyBlock
              icon={CalendarClock}
              title="No bookings today"
              body="New bookings show here."
              action={
                onGoToTab ? (
                  <button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={() => onGoToTab("capacity")}>
                    Check quota <ArrowRight size={14} aria-hidden />
                  </button>
                ) : undefined
              }
            />
          ) : (
            <EmptyBlock title="No matches" body="Try another filter." />
          )
        ) : (
          <div className="m-table-wrap m-table-wrap--bordered">
            <table className="m-table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Slot</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const m = metaOf(a.status);
                  const isNext = next?.bookingId === a.bookingId;
                  return (
                    <tr key={a.bookingId} className={m.group === "done" || m.group === "missed" ? "is-muted" : isNext ? "is-selected" : undefined}>
                      <td className="tabular">
                        <span className="m-cell-main">{clockTime(a.slotStart)}</span>
                        <span className="m-cell-sub">to {clockTime(a.slotEnd)}</span>
                      </td>
                      <td>
                        <span className="m-cell-flex">
                          <span className="m-avatar m-avatar--sm m-avatar--light" aria-hidden>{initialsOf(a.customerName)}</span>
                          <span className="m-cell-main">{a.customerName}</span>
                          {isNext ? <Badge tone="info" size="sm">Next</Badge> : null}
                        </span>
                      </td>
                      <td>{a.serviceName}</td>
                      <td><Badge tone={m.tone} dot>{m.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
