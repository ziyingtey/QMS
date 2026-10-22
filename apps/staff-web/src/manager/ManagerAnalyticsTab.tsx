import type { BranchAnalyticsToday } from "../api";
import { AlertTriangle, BarChart3, CloudOff, Power, QrCode } from "lucide-react";
import {
  AnalyticsKpi,
  ChannelSplit,
  ChartCard,
  CounterUtilizationList,
  Meter,
  MissedByHourChart,
  QueuePerformanceTable,
  ServicePerformanceTable,
  SparkBars,
  TicketStatusStrip,
  TicketVolumeChart,
  WaitDistributionChart,
} from "./ManagerAnalyticsCharts";
import { CHART, alignHours, formatHourLabel, formatPercent, peakIndex, withBusinessHours } from "./chartTheme";
import { Badge, Card, EmptyBlock, PageHeader, PageSkeleton } from "./ui";
import { plural } from "./uiTones";
import type { ManagerTab } from "./managerNav";

type Props = {
  analytics: BranchAnalyticsToday | null;
  analyticsSource?: "api" | "fallback" | null;
  onGoToTab?: (tab: ManagerTab) => void;
};

/** Whole minutes for compact KPI footers ("6m"); "—" when missing. */
function roundMinutes(m: number | null | undefined): string {
  return m == null || Number.isNaN(m) ? "—" : `${Math.round(m)}m`;
}

function SectionLabel({ children }: { children: string }) {
  return <h2 className="m-section-title">{children}</h2>;
}

export function ManagerAnalyticsTab({ analytics, analyticsSource, onGoToTab }: Props) {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Today at a glance"
        actions={<Badge tone="outline" dot>Today</Badge>}
      />

      {analyticsSource === "fallback" && analytics ? (
        <div className="m-callout" role="status">
          <AlertTriangle size={16} aria-hidden />
          Partial data. Analytics is not responding.
        </div>
      ) : null}

      {!analytics ? (
        analyticsSource === "fallback" ? (
          <Card>
            <EmptyBlock
              icon={CloudOff}
              title="Analytics unavailable"
              body="It will load when the server is back."
            />
          </Card>
        ) : (
          <PageSkeleton stats={5} />
        )
      ) : (
        <AnalyticsContent analytics={analytics} onGoToTab={onGoToTab} />
      )}
    </>
  );
}

function AnalyticsContent({ analytics: a, onGoToTab }: { analytics: BranchAnalyticsToday; onGoToTab?: (tab: ManagerTab) => void }) {
  const hours = a.ticketsByHour.map((r) => r.hourLabel);
  const pi = peakIndex(a.ticketsByHour);
  const peakRow = pi >= 0 && a.ticketsByHour[pi].count > 0 ? a.ticketsByHour[pi] : null;
  const peakHour = peakRow ? formatHourLabel(peakRow.hourLabel) : null;
  // noShowsByHour / noShows = Missed tickets (called, no response), not booking no-shows.
  const missedRows = alignHours(hours, a.noShowsByHour);

  // Charts render as soon as there is any data; placeholders only for true zeros.
  const missedTotal = missedRows.reduce((s, r) => s + r.count, 0);
  const calledTotal = a.ticketToCallDistribution.reduce((s, b) => s + b.count, 0);
  const slaTotal = (a.ticketToCall.slaMetCount ?? 0) + (a.ticketToCall.slaExceededCount ?? 0);
  // Ticket-to-call is measured on completed visits; without any, the average is meaningless.
  const hasWaitData = calledTotal > 0 || slaTotal > 0 || a.customersServed > 0;
  const slaPct = slaTotal > 0 || calledTotal > 0 ? a.ticketToCallSlaPercent : null;

  const servedPct = a.ticketsToday > 0 && a.customersServed > 0 ? (a.customersServed / a.ticketsToday) * 100 : null;
  // Online missed rate only means something once online tickets have resolved (served or missed).
  const onlineResolved = a.online.served + a.online.noShows;
  const onlineMissedPct =
    a.online.tickets === 0 || onlineResolved === 0
      ? null
      : a.online.noShowRatePercent != null
        ? a.online.noShowRatePercent
        : (a.online.noShows / a.online.tickets) * 100;

  // Live queue activity by name, so services with tickets in progress (but nothing served yet) still show up.
  const queueActivity = new Map(
    (a.queuePerformance ?? []).map((q) => [q.name.trim().toLowerCase(), { waiting: q.waiting, serving: q.serving }]),
  );

  const kpis = (
    /* KPI row: label, number, one short line. Deltas stay hidden until the API returns previous-period values. */
    <div className="m-stats m-stats--5">
      <AnalyticsKpi
        label="Tickets"
        value={a.ticketsToday}
        foot={a.ticketsToday === 0 ? "None yet" : peakHour ? `Busiest ${peakHour}` : "Today"}
        visual={<SparkBars values={withBusinessHours(a.ticketsByHour).map((r) => r.count)} />}
      />
      <AnalyticsKpi
        label="Served"
        value={a.customersServed}
        foot={servedPct != null ? `${Math.round(servedPct)}% of tickets` : "None yet"}
      />
      <AnalyticsKpi
        label="Avg. wait"
        value={hasWaitData ? Math.round(a.ticketToCall.avgMinutes) : "—"}
        unit="min"
        foot={hasWaitData ? `Longest ${roundMinutes(a.ticketToCall.longestMinutes)}` : "No visits yet"}
      />
      <AnalyticsKpi
        label="Within target"
        value={formatPercent(slaPct)}
        visual={slaPct != null ? <Meter percent={slaPct} /> : null}
        foot={slaTotal > 0 ? `${a.ticketToCall.slaMetCount ?? 0} of ${slaTotal} visits` : "No calls yet"}
      />
      <AnalyticsKpi
        label="Online missed"
        value={onlineMissedPct == null ? "—" : formatPercent(onlineMissedPct, Number.isInteger(onlineMissedPct) ? 0 : 1)}
        foot={a.online.tickets === 0 ? "No bookings yet" : onlineResolved === 0 ? "None due yet" : `${a.online.noShows} of ${a.online.tickets}`}
        visual={missedTotal > 0 ? <SparkBars values={missedRows.map((r) => r.count)} color={CHART.neutral} /> : null}
      />
    </div>
  );

  // Nothing has happened yet today: one intentional empty state instead of a page of placeholder charts.
  if (a.ticketsToday === 0 && a.customersServed === 0) {
    const openCounters = a.counterUtilization.filter((c) => c.mode.toLowerCase() === "active").length;
    const totalCounters = a.counterUtilization.length;
    return (
      <>
        {kpis}
        <Card
          footer={
            <div className="m-empty-facts">
              <span><b>{a.lanePerformance.length}</b> {a.lanePerformance.length === 1 ? "service" : "services"}</span>
              <span><b>{(a.queuePerformance ?? []).length}</b> {(a.queuePerformance ?? []).length === 1 ? "lane" : "lanes"}</span>
              <span><b>{openCounters}</b> of {plural(totalCounters, "counter")} open</span>
            </div>
          }
        >
          <EmptyBlock
            icon={BarChart3}
            title="No activity yet"
            body="Charts show after the first ticket."
            action={
              onGoToTab ? (
                <span className="m-row m-row--center">
                  {openCounters === 0 && totalCounters > 0 ? (
                    <button type="button" className="m-btn m-btn--primary m-btn--sm" onClick={() => onGoToTab("counters")}>
                      <Power size={14} aria-hidden /> Open a counter
                    </button>
                  ) : null}
                  <button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={() => onGoToTab("qr")}>
                    <QrCode size={14} aria-hidden /> Show walk-in QR
                  </button>
                </span>
              ) : undefined
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {kpis}

      <SectionLabel>Demand</SectionLabel>
      <div className="m-grid">
        <ChartCard className="m-col-8 m-row-2" title="Tickets by hour" figure={a.ticketsToday} figureLabel="today">
          <TicketVolumeChart rows={a.ticketsByHour} peak={a.peak} />
        </ChartCard>
        <ChartCard className="m-col-4" title="Walk-in vs online">
          <ChannelSplit walkIn={a.walkIn} online={a.online} />
        </ChartCard>
        <ChartCard className="m-col-4" title="Missed by hour" figure={missedTotal} compact={missedTotal === 0}>
          <MissedByHourChart rows={missedRows} />
        </ChartCard>
      </div>

      <SectionLabel>Waiting</SectionLabel>
      <div className="m-grid">
        <ChartCard
          className="m-col-7"
          title="Wait time"
          figure={slaPct != null ? formatPercent(slaPct) : undefined}
          figureLabel={slaPct != null ? "within target" : undefined}
          compact={calledTotal === 0}
        >
          <WaitDistributionChart buckets={a.ticketToCallDistribution} timing={a.ticketToCall} />
        </ChartCard>
        <ChartCard className="m-col-5" title="Outcomes" compact={a.ticketStatus.ticketsToday === 0}>
          <TicketStatusStrip status={a.ticketStatus} service={a.serviceDuration} />
        </ChartCard>
      </div>

      <SectionLabel>Services and lanes</SectionLabel>
      <div className="m-grid">
        <ChartCard className="m-col-12" title="By service" flush>
          <ServicePerformanceTable lanes={a.lanePerformance} queueActivity={queueActivity} />
        </ChartCard>
        <ChartCard className="m-col-12" title="By lane" flush>
          <QueuePerformanceTable rows={a.queuePerformance ?? []} />
        </ChartCard>
      </div>

      <SectionLabel>Staffing</SectionLabel>
      <div className="m-grid">
        <ChartCard className="m-col-12" title="Counter use" flush>
          <CounterUtilizationList rows={a.counterUtilization} />
        </ChartCard>
      </div>

      <p className="m-footnote">
        <strong>Wait</strong>: ticket to call. <strong>Service time</strong>: call to finish. <strong>Use</strong>: time serving.
      </p>
    </>
  );
}
