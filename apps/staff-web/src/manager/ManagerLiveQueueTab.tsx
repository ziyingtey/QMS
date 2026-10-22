import { useMemo, useState } from "react";
import { ArrowRight, Hourglass, Monitor, Power, QrCode, Timer, Users, UserRound } from "lucide-react";
import type { AssignableStaffDto, BranchQueueDto, LiveDashboard, ManagerCounterRowDto, ManagerWaitingTicket } from "../api";
import { staffDisplayName } from "./managerUtils";
import { Badge, Card, EmptyBlock, PageHeader, PageSkeleton, Segmented, StatCard, TooLongBadge } from "./ui";
import { counterModeMeta, slotRange, minutesSince, plural } from "./uiTones";
import type { ManagerTab } from "./managerNav";

type Props = {
  live: LiveDashboard | null;
  waiting: ManagerWaitingTicket[];
  queues?: BranchQueueDto[];
  rows: ManagerCounterRowDto[];
  staffPickList: AssignableStaffDto[];
  onGoToCounter: (counterId: string) => void;
  onGoToTab?: (tab: ManagerTab) => void;
};

type Channel = "all" | "walkin" | "online";

function isOnline(t: ManagerWaitingTicket): boolean {
  return t.entryType === "OnlineBooked" || t.entryType.toLowerCase() === "online";
}

/** Live Monitor: "Who is waiting right now, and for how long?" */
export function ManagerLiveQueueTab({ live, waiting, queues = [], rows, staffPickList, onGoToCounter, onGoToTab }: Props) {
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [channel, setChannel] = useState<Channel>("all");

  // Map each service name to its lettered queue (prefix + SLA) so tickets can be filtered by queue.
  const queueByService = useMemo(() => {
    const m = new Map<string, BranchQueueDto>();
    for (const q of queues) for (const n of q.serviceNames ?? []) m.set(n.trim().toLowerCase(), q);
    return m;
  }, [queues]);
  const queueOf = (t: ManagerWaitingTicket) => queueByService.get(t.serviceName.trim().toLowerCase());

  if (!live) {
    return (
      <>
        <PageHeader title="Live Monitor" description="Loading the live queue…" />
        <PageSkeleton />
      </>
    );
  }

  const queueTabs = queues
    .map((q) => ({ q, n: waiting.filter((t) => queueOf(t)?.id === q.id).length }))
    .filter((x) => x.n > 0 || x.q.id === queueFilter);
  const filtered = waiting
    .filter((t) => queueFilter === "all" || queueOf(t)?.id === queueFilter)
    .filter((t) => channel === "all" || (channel === "online" ? isOnline(t) : !isOnline(t)))
    .sort((a, b) => a.position - b.position);
  const onlineCount = waiting.filter(isOnline).length;
  const noWaitData = live.customersServedToday === 0 && live.avgTicketToCallMinutes === 0;
  const breaches = live.ticketToCallBreaches ?? 0;
  const sortedCounters = [...rows].sort(
    (a, b) => ["active", "break", "closed"].indexOf(counterModeMeta(a.mode).key) - ["active", "break", "closed"].indexOf(counterModeMeta(b.mode).key) || a.number - b.number,
  );
  const shownCounters = sortedCounters.filter((r) => counterModeMeta(r.mode).key !== "closed");
  const closedCount = sortedCounters.length - shownCounters.length;
  // Counter to suggest when nothing is open: the first one that already serves a lane.
  const firstToOpen = sortedCounters.find((r) => r.allowedServiceTypeIds.length > 0) ?? sortedCounters[0];
  const openCounterButton = firstToOpen ? (
    <button type="button" className="m-btn m-btn--primary m-btn--sm" onClick={() => onGoToCounter(firstToOpen.id)}>
      <Power size={14} aria-hidden /> Open counter
    </button>
  ) : undefined;

  return (
    <>
      <PageHeader title="Live Monitor" />

      <div className="m-stats">
        <StatCard
          label="Waiting"
          icon={Users}
          value={live.queueLength}
          badge={breaches > 0 ? <TooLongBadge count={breaches} /> : live.queueLength > 0 ? <Badge tone="success" dot>OK</Badge> : undefined}
          context={live.queueLength === 0 ? "No one waiting" : `${live.walkInsWaiting} walk-in, ${live.onlineWaiting} online`}
        />
        <StatCard
          label="Serving"
          icon={UserRound}
          value={live.servingCount}
          badge={live.activeCounters > 0 ? <Badge tone="info" dot>{live.activeCounters} open</Badge> : <Badge tone="neutral" dot>All closed</Badge>}
          context={live.customersServedToday === 0 ? "None served yet" : `${live.customersServedToday} served today`}
        />
        <StatCard
          label="Avg. wait"
          icon={Hourglass}
          value={noWaitData ? "—" : Math.round(live.avgTicketToCallMinutes)}
          empty={noWaitData}
          unit="min"
          context={noWaitData ? "No visits yet" : "Today"}
        />
        <StatCard
          label="Longest wait"
          icon={Timer}
          value={live.queueLength === 0 ? "—" : Math.round(live.longestTicketToCallMinutes)}
          empty={live.queueLength === 0}
          unit="min"
          badge={
            live.queueLength > 0 ? (
              // Same rule as the Waiting badge: too long only if someone is over their lane target.
              <Badge tone={breaches > 0 ? "danger" : "success"} dot>
                {breaches > 0 ? "Too long" : "OK"}
              </Badge>
            ) : undefined
          }
          context={live.queueLength === 0 ? "No one waiting" : "Oldest ticket"}
        />
      </div>

      <div className="m-grid">
        <Card
          /* A short list should not stretch into a tall blank card next to the side column. */
          className={`m-col-8${filtered.length > 0 && filtered.length <= 4 ? " m-self-start" : ""}`}
          title="Waiting"
          action={
            waiting.length === 0 ? undefined : (
            <Segmented<Channel>
              label="Channel"
              size="sm"
              value={channel}
              onChange={setChannel}
              options={[
                { value: "all", label: "All" },
                { value: "walkin", label: "Walk-in", count: waiting.length - onlineCount },
                { value: "online", label: "Online", count: onlineCount },
              ]}
            />
            )
          }
          flush
        >
          {queueTabs.length > 0 ? (
            <div className="m-card__toolbar">
              <Segmented<string>
                label="Lane"
                value={queueFilter}
                onChange={setQueueFilter}
                options={[
                  { value: "all", label: "All lanes", count: waiting.length },
                  ...queueTabs.map(({ q, n }) => ({ value: q.id, label: <><b className="m-seg__prefix">{q.ticketPrefix}</b>{q.name}</>, count: n })),
                ]}
              />
            </div>
          ) : null}
          {filtered.length === 0 ? (
            waiting.length > 0 ? (
              <EmptyBlock title="No matches" body="Try another filter." />
            ) : shownCounters.length === 0 ? (
              <EmptyBlock
                icon={Users}
                title="No one waiting"
                body="Open a counter to start serving."
                action={openCounterButton}
              />
            ) : (
              <EmptyBlock
                positive
                title="No one waiting"
                body="New tickets show here."
                action={
                  onGoToTab ? (
                    <button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={() => onGoToTab("qr")}>
                      <QrCode size={14} aria-hidden /> Show QR
                    </button>
                  ) : undefined
                }
              />
            )
          ) : (
            <div className="m-table-wrap m-table-wrap--bordered">
              <table className="m-table">
                <thead>
                  <tr>
                    <th className="m-num" style={{ width: 56 }}>#</th>
                    <th>Ticket</th>
                    <th>Service</th>
                    <th>Channel</th>
                    <th>Slot</th>
                    <th className="m-num">Waiting</th>
                    <th className="m-num">Est. wait</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const q = queueOf(t);
                    const online = isOnline(t);
                    // Server wait start + lane target (same rule as the breach count); old client rule if absent.
                    const waited = minutesSince(
                      t.waitStartAt ??
                        (online && t.assignedSlotStart && new Date(t.assignedSlotStart) > new Date(t.createdAt) ? t.assignedSlotStart : t.createdAt),
                    );
                    const target = t.serviceLevelMinutes ?? q?.serviceLevelMinutes ?? 15;
                    // "Too long" means above the target, as in the breach count.
                    const tone = waited > target ? "danger" : waited >= target * 0.75 ? "warning" : "success";
                    return (
                      <tr key={t.id}>
                        <td className="m-num m-muted">{t.position}</td>
                        <td>
                          <span className="m-ticket">{t.ticketNumber}</span>
                        </td>
                        <td>
                          <span className="m-cell-main m-nowrap">{t.serviceName}</span>
                          {q ? <span className="m-cell-sub" title={`Target ${q.serviceLevelMinutes} min`}>Lane {q.ticketPrefix}</span> : null}
                        </td>
                        <td>
                          <span className="m-row">
                            <Badge tone={online ? "violet" : "neutral"} size="sm">{online ? "Online" : "Walk-in"}</Badge>
                            {online && !t.checkedIn ? <Badge tone="warning" size="sm">Not checked in</Badge> : null}
                          </span>
                        </td>
                        <td className="m-muted tabular m-nowrap">{t.assignedSlotStart ? slotRange(t.assignedSlotStart, t.assignedSlotEnd) : "—"}</td>
                        <td className="m-num">
                          <span className={`m-wait m-wait--${tone}`}>{waited < 1 ? "<1" : Math.floor(waited)} min</span>
                        </td>
                        <td className="m-num m-muted">{t.estimatedWaitMinutes != null ? `${Math.round(t.estimatedWaitMinutes)} min` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="m-col-4 m-stack m-self-start">
          <Card title="Counters" flush>
            {rows.length === 0 ? (
              <EmptyBlock icon={Monitor} title="No counters yet" body="Add counters to start serving." />
            ) : shownCounters.length === 0 ? (
              <EmptyBlock
                inline
                icon={Monitor}
                title="All counters closed"
                body={plural(closedCount, "counter")}
                action={
                  firstToOpen ? (
                    <button type="button" className="m-btn m-btn--link" onClick={() => onGoToCounter(firstToOpen.id)}>Open one</button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="m-list">
                {shownCounters.map((r) => {
                  const m = counterModeMeta(r.mode);
                  return (
                    <li key={r.id} className="m-list__item">
                      <span className={`m-token m-token--${m.key === "active" ? "success" : m.key === "break" ? "warning" : "neutral"}`}>{r.number}</span>
                      <span className="m-list__main">
                        <span className="m-list__title">{r.assignedStaffEmail ? staffDisplayName(r, staffPickList) : "No teller"}</span>
                        <span className="m-list__sub">{r.currentDedicatedLaneName ?? r.allowedLanesDisplay ?? "—"}</span>
                      </span>
                      <span className="m-list__end">
                        <Badge tone={m.tone} dot size="sm">{m.label}</Badge>
                        <button type="button" className="m-btn m-btn--ghost m-btn--icon m-btn--sm" onClick={() => onGoToCounter(r.id)} aria-label={`Configure counter ${r.number}`}>
                          <ArrowRight size={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  );
                })}
                {closedCount > 0 ? <li className="m-list__more">{closedCount} closed</li> : null}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
