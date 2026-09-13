import type { BranchAnalyticsToday, LiveDashboard, ManagerInsights } from "../api";

/** Partial analytics from live + insights when the analytics API is unavailable. */
export function buildAnalyticsFallback(
  live: LiveDashboard | null,
  insights: ManagerInsights | null,
): BranchAnalyticsToday | null {
  if (!live && !insights) return null;

  const lanes = insights?.lanes ?? [];
  const served = live?.customersServedToday ?? lanes.reduce((s, l) => s + l.completedToday, 0);
  const tickets = (live?.walkInsToday ?? 0) + (live?.appointmentsToday ?? 0) || served + (live?.queueLength ?? 0);

  return {
    ticketsToday: tickets,
    customersServed: served,
    ticketToCall: {
      avgMinutes: live?.avgTicketToCallMinutes ?? 0,
      medianMinutes: null,
      longestMinutes: live?.longestTicketToCallMinutes ?? null,
      slaMetCount: null,
      slaExceededCount: live?.ticketToCallBreaches ?? null,
    },
    serviceDuration: {
      avgMinutes: lanes.length > 0 ? Math.round((lanes.reduce((s, l) => s + l.avgServiceMinutesObserved, 0) / lanes.length) * 10) / 10 : 0,
      medianMinutes: null,
      longestMinutes: null,
      slaMetCount: null,
      slaExceededCount: null,
    },
    ticketToCallSlaPercent: null,
    slaTargetMinutes: 15,
    ticketStatus: {
      ticketsToday: tickets,
      served,
      waiting: live?.queueLength ?? 0,
      serving: live?.servingCount ?? 0,
      noShow: insights?.noShowsToday ?? 0,
      cancelled: 0,
    },
    walkIn: {
      tickets: live?.walkInsToday ?? 0,
      served: 0,
      noShows: 0,
      noShowRatePercent: null,
      avgTicketToCallMinutes: null,
    },
    online: {
      tickets: live?.appointmentsToday ?? 0,
      served: 0,
      noShows: insights?.noShowsToday ?? 0,
      noShowRatePercent: null,
      avgTicketToCallMinutes: null,
    },
    ticketsByHour: [],
    peak: null,
    ticketToCallDistribution: [
      { label: "0–5 min", count: 0 },
      { label: "5–10 min", count: 0 },
      { label: "10–15 min", count: 0 },
      { label: "15–20 min", count: 0 },
      { label: "20+ min", count: 0 },
    ],
    lanePerformance: lanes.map((l) => ({
      serviceTypeId: l.serviceTypeId,
      serviceName: l.serviceName,
      served: l.completedToday,
      avgTicketToCallMinutes: l.estimatedWaitMinutes,
      maxTicketToCallMinutes: null,
      avgServiceMinutes: l.avgServiceMinutesObserved || null,
      ticketToCallSlaPercent: null,
    })),
    counterUtilization: [],
    noShowsByHour: [],
  };
}
