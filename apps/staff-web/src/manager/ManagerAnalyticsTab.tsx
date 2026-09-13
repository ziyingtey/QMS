import type { BranchAnalyticsToday } from "../api";
import { KpiTile } from "../components/KpiTile";
import {
  ChannelCompareChart,
  CounterUtilizationChart,
  QueuePerformancePanel,
  ServicePerformanceTable,
  TicketStatusStrip,
  TicketVolumeChart,
} from "./ManagerAnalyticsCharts";

type Props = {
  analytics: BranchAnalyticsToday | null;
  analyticsSource?: "api" | "fallback" | null;
};

export function ManagerAnalyticsTab({ analytics, analyticsSource }: Props) {
  const onlineNoShow =
    analytics?.online.noShowRatePercent != null
      ? `${analytics.online.noShowRatePercent}%`
      : analytics && analytics.online.tickets > 0
        ? `${Math.round((analytics.online.noShows / analytics.online.tickets) * 1000) / 10}%`
        : "—";

  return (
    <div className="qgo-mgr-analytics-page">
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Today&apos;s analytics</h1>
          <p className="qgo-muted">Historical performance — for live queue, open Dashboard.</p>
        </div>
        <span className="qgo-mgr-toolbar__chip">Today</span>
      </header>

      {analyticsSource === "fallback" ? (
        <div className="qgo-banner qgo-banner--warn qgo-mgr-hours-banner" role="status">
          Partial data only. Restart API for full analytics.
        </div>
      ) : null}

      {!analytics ? (
        <p className="qgo-muted">Loading analytics…</p>
      ) : (
        <>
          <p className="qgo-mgr-data-note qgo-mgr-data-note--compact">
            Ticket→call = ticket issued (walk-in) or max(check-in, slot start) (online) until called. Service duration = counter start until end. Not physical arrival.
          </p>

          <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--analytics">
            <KpiTile variant="manager" label="Tickets" value={analytics.ticketsToday} foot="Issued" accent="navy" />
            <KpiTile variant="manager" label="Served" value={analytics.customersServed} foot="Completed" accent="green" />
            <KpiTile variant="manager" label="Avg ticket→call" value={`${analytics.ticketToCall.avgMinutes}m`} foot="Branch-wide" accent="amber" />
            <KpiTile variant="manager" label="Online no-show" value={onlineNoShow} foot={`${analytics.online.noShows} of ${analytics.online.tickets}`} accent="blue" />
          </div>

          <div className="qgo-mgr-analytics-layout">
            <section className="qgo-mgr-panel qgo-mgr-panel--chart">
              <header className="qgo-mgr-panel__head">
                <h2>Demand</h2>
                <p className="qgo-muted">Tickets issued by hour</p>
              </header>
              <TicketVolumeChart rows={analytics.ticketsByHour} peak={analytics.peak} />
            </section>

            <section className="qgo-mgr-panel qgo-mgr-panel--chart">
              <header className="qgo-mgr-panel__head">
                <h2>Walk-in vs online</h2>
                <p className="qgo-muted">Hybrid channel split</p>
              </header>
              <ChannelCompareChart walkIn={analytics.walkIn} online={analytics.online} noShowsByHour={analytics.noShowsByHour} />
            </section>

            <section className="qgo-mgr-panel qgo-mgr-panel--span2">
              <header className="qgo-mgr-panel__head">
                <h2>Performance by service</h2>
                <p className="qgo-muted">Volume, queue time, and counter handling per lane</p>
              </header>
              <ServicePerformanceTable lanes={analytics.lanePerformance} />
            </section>

            <section className="qgo-mgr-panel qgo-mgr-panel--chart">
              <header className="qgo-mgr-panel__head">
                <h2>Queue processing</h2>
                <p className="qgo-muted">Ticket-to-call time</p>
              </header>
              <QueuePerformancePanel timing={analytics.ticketToCall} buckets={analytics.ticketToCallDistribution} />
            </section>

            <section className="qgo-mgr-panel qgo-mgr-panel--chart">
              <header className="qgo-mgr-panel__head">
                <h2>Outcomes</h2>
                <p className="qgo-muted">Ticket status today</p>
              </header>
              <TicketStatusStrip status={analytics.ticketStatus} />
              <div className="qgo-mgr-analytics-service-time">
                <span className="qgo-mgr-analytics-service-time__label">Avg service (branch)</span>
                <strong>{analytics.serviceDuration.avgMinutes}m</strong>
                {analytics.serviceDuration.medianMinutes != null ? (
                  <span className="qgo-muted">median {analytics.serviceDuration.medianMinutes}m</span>
                ) : null}
              </div>
            </section>

            <section className="qgo-mgr-panel qgo-mgr-panel--span2">
              <header className="qgo-mgr-panel__head">
                <h2>Counter utilization</h2>
                <p className="qgo-muted">Serving time ÷ operating time</p>
              </header>
              <CounterUtilizationChart rows={analytics.counterUtilization} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
