import { useState } from "react";
import { ArrowRight, Clock3, Hourglass, Monitor, QrCode, Ticket, Users } from "lucide-react";
import type {
  AssignableStaffDto,
  BranchAnalyticsToday,
  BranchDto,
  BranchQueueDto,
  LiveDashboard,
  ManagerCounterRowDto,
  ManagerInsights,
} from "../api";
import { AlertList, CounterTiles, LaneList } from "./ManagerBlocks";
import { QueueTodayChart } from "./ManagerAnalyticsCharts";
import { CHART, alignHours, formatHourLabel, peakIndex } from "./chartTheme";
import { counterStats } from "./managerUtils";
import { Badge, Card, EmptyBlock, PageHeader, PageSkeleton, Segmented, StatCard, TooLongBadge } from "./ui";
import type { ManagerTab } from "./managerNav";
import { lanesFrom } from "./uiTones";

type Props = {
  live: LiveDashboard | null;
  insights: ManagerInsights | null;
  analytics: BranchAnalyticsToday | null;
  rows: ManagerCounterRowDto[];
  queues: BranchQueueDto[];
  branch: BranchDto | undefined;
  staffPickList: AssignableStaffDto[];
  branchOpenForOperations?: boolean;
  busy?: boolean;
  onGoToCounter: (counterId: string) => void;
  onGoToTab: (tab: ManagerTab) => void;
  onSetMode: (counterId: string, mode: "Active" | "Break" | "Closed") => void | Promise<void>;
  onAllowedLaneToggle: (counterId: string, laneId: string, checked: boolean) => void | Promise<void>;
};

type Series = "tickets" | "missed";

/** Dashboard: "Is the branch keeping up right now, and what needs my attention?" */
export function ManagerDashboardTab({
  live,
  insights,
  analytics,
  rows,
  queues,
  branch,
  staffPickList,
  branchOpenForOperations = true,
  busy = false,
  onGoToCounter,
  onGoToTab,
  onSetMode,
  onAllowedLaneToggle,
}: Props) {
  const [series, setSeries] = useState<Series>("tickets");

  if (!live) {
    return (
      <>
        <PageHeader title="Dashboard" description="Loading today's branch activity…" />
        <PageSkeleton />
      </>
    );
  }

  const stats = counterStats(rows);
  const unstaffedOpen = rows.filter((r) => r.mode.toLowerCase() === "active" && !r.assignedStaffEmail).length;
  const noneOpen = branchOpenForOperations && stats.total > 0 && stats.open === 0 && stats.break === 0;
  const alertCount = (insights?.alerts.length ?? 0) + unstaffedOpen + (noneOpen ? 1 : 0);
  const lanes = lanesFrom(queues, insights);
  const breaches = live.ticketToCallBreaches ?? 0;
  // The live average only means something once visits have completed.
  const noWaitData = live.customersServedToday === 0 && live.avgTicketToCallMinutes === 0;
  const noActivity = live.queueLength === 0 && live.servingCount === 0 && live.customersServedToday === 0;

  // Headline status: one badge that answers "are we keeping up?"
  const health =
    breaches > 0 || (live.queueLength > 0 && stats.open === 0)
      ? { tone: "danger" as const, text: "Needs action" }
      : noneOpen
        ? { tone: "warning" as const, text: "No counters open" }
        : alertCount > 0
          ? { tone: "warning" as const, text: `${alertCount} to check` }
        : { tone: "success" as const, text: "On track" };

  const crowd =
    live.queueLength > 15
      ? { tone: "danger" as const, text: "High" }
      : live.queueLength > 5
        ? { tone: "warning" as const, text: "Busy" }
        : { tone: "success" as const, text: live.queueLength === 0 ? "Empty" : "Light" };

  // Queue today: tickets by hour, or missed tickets (called, no response; API name noShowsByHour).
  const hourRows = analytics?.ticketsByHour ?? [];
  const missedRows = analytics ? alignHours(hourRows.map((r) => r.hourLabel), analytics.noShowsByHour) : [];
  const chartRows = series === "tickets" ? hourRows : missedRows;
  const pi = peakIndex(hourRows);
  const peak = pi >= 0 && hourRows[pi].count > 0 ? formatHourLabel(hourRows[pi].hourLabel) : null;
  const ticketsToday = analytics?.ticketsToday ?? live.walkInsToday + live.appointmentsToday;
  const missedTotal = missedRows.reduce((s, r) => s + r.count, 0);

  return (
    <>
      <PageHeader
        title={
          <span className="m-row">
            Dashboard <Badge tone={health.tone} dot>{health.text}</Badge>
          </span>
        }
        description={
          noActivity ? "No customers yet" : (
            <>
              <strong>{live.queueLength}</strong> waiting, <strong>{live.servingCount}</strong> serving
            </>
          )
        }
        actions={
          <>
            <button type="button" className="m-btn m-btn--secondary" onClick={() => onGoToTab("analytics")}>
              Analytics
            </button>
            <button type="button" className="m-btn m-btn--primary" onClick={() => onGoToTab("queue")}>
              Live Monitor <ArrowRight size={15} aria-hidden />
            </button>
          </>
        }
      />

      <div className="m-stats">
        <StatCard
          label="Waiting now"
          icon={Users}
          value={live.queueLength}
          badge={<Badge tone={crowd.tone} dot>{crowd.text}</Badge>}
          context={live.queueLength === 0 ? "No one waiting" : `${live.walkInsWaiting} walk-in, ${live.onlineWaiting} online`}
        />
        <StatCard
          label="Avg. wait"
          icon={Hourglass}
          value={noWaitData ? "—" : Math.round(live.avgTicketToCallMinutes)}
          unit="min"
          empty={noWaitData}
          badge={
            breaches > 0 ? (
              <TooLongBadge count={breaches} />
            ) : live.queueLength > 0 && !noWaitData ? (
              <Badge tone="success" dot>OK</Badge>
            ) : undefined
          }
          context={
            live.longestTicketToCallMinutes > 0
              ? `Longest ${Math.round(live.longestTicketToCallMinutes)} min`
              : noWaitData
                ? "No visits yet"
                : "No long waits"
          }
        />
        <StatCard
          label="Served today"
          icon={Clock3}
          value={live.customersServedToday}
          empty={false}
          badge={live.servingCount > 0 ? <Badge tone="info" dot>{live.servingCount} serving</Badge> : undefined}
          context={live.customersServedToday === 0 ? "None yet" : `${live.walkInsToday} walk-in, ${live.appointmentsToday} booked`}
        />
        <StatCard
          label="Counters open"
          icon={Monitor}
          value={stats.open}
          unit={`/ ${stats.total}`}
          badge={
            unstaffedOpen > 0 ? (
              <Badge tone="warning" dot>No teller</Badge>
            ) : stats.break > 0 ? (
              <Badge tone="warning" dot>{stats.break} on break</Badge>
            ) : stats.open > 0 ? (
              <Badge tone="success" dot>Staffed</Badge>
            ) : (
              <Badge tone="neutral" dot>All closed</Badge>
            )
          }
          context={branchOpenForOperations ? `${stats.closed} closed` : "Branch closed"}
        />
      </div>

      <div className="m-grid">
        <Card
          className="m-col-8"
          title="Tickets today"
          description={ticketsToday > 0 && series === "tickets" && peak ? `Busiest ${peak}` : undefined}
          action={
            ticketsToday > 0 ? (
              <Segmented<Series>
                label="Chart series"
                size="sm"
                value={series}
                onChange={setSeries}
                options={[
                  { value: "tickets", label: "Tickets", count: ticketsToday },
                  { value: "missed", label: "Missed", count: missedTotal },
                ]}
              />
            ) : undefined
          }
          center={ticketsToday === 0}
        >
          {ticketsToday === 0 ? (
            <EmptyBlock
              icon={Ticket}
              title="No tickets yet"
              body="They show here by hour."
              action={
                <button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={() => onGoToTab("qr")}>
                  <QrCode size={14} aria-hidden /> Show QR
                </button>
              }
            />
          ) : (
            <QueueTodayChart
              rows={chartRows}
              unit={series === "tickets" ? " tickets" : " missed"}
              color={series === "tickets" ? CHART.accent : CHART.status.warn}
            />
          )}
        </Card>

        <Card
          className="m-col-4"
          title="Needs attention"
          action={alertCount > 0 ? <Badge tone="warning">{alertCount}</Badge> : undefined}
          flush
        >
          <AlertList
            insights={insights}
            rows={rows}
            branch={branch}
            busy={busy}
            branchOpen={branchOpenForOperations}
            onGoToCounter={onGoToCounter}
            onGoToLive={() => onGoToTab("queue")}
            onSetMode={onSetMode}
            onAllowedLaneToggle={onAllowedLaneToggle}
          />
        </Card>

        <Card
          className="m-col-8"
          title="Counters"
          action={
            <button type="button" className="m-btn m-btn--ghost m-btn--sm" onClick={() => onGoToTab("counters")}>
              Manage <ArrowRight size={14} aria-hidden />
            </button>
          }
        >
          <CounterTiles rows={rows} branch={branch} staffPickList={staffPickList} onOpen={onGoToCounter} />
        </Card>

        <Card
          className="m-col-4"
          title="Lanes"
          action={
            <button type="button" className="m-btn m-btn--ghost m-btn--sm" onClick={() => onGoToTab("queues")}>
              All <ArrowRight size={14} aria-hidden />
            </button>
          }
          flush
        >
          <LaneList lanes={lanes} onShowAll={() => onGoToTab("queues")} />
        </Card>
      </div>
    </>
  );
}
