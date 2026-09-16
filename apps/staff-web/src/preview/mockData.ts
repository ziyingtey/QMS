import type {
  AssignableStaffDto,
  BranchAnalyticsToday,
  BranchDto,
  BranchOperationalSettings,
  LiveDashboard,
  ManagerCounterRowDto,
  ManagerInsights,
  MyCounterDto,
  WaitingTicketDto,
} from "../api";
import { defaultWeeklyHours } from "../manager/managerUtils";

export const MOCK_BRANCHES: BranchDto[] = [
  {
    id: "preview-branch-1",
    branchCode: 101,
    name: "QGo KL Main Branch",
    address: "Jalan Ampang, Kuala Lumpur",
    state: "WP Kuala Lumpur",
    services: [
      { id: "svc-personal", code: "PERS", name: "Personal Banking", defaultAvgServiceMinutes: 12 },
      { id: "svc-business", code: "BIZ", name: "Business Banking", defaultAvgServiceMinutes: 18 },
      { id: "svc-loan", code: "LOAN", name: "Loan Consultation", defaultAvgServiceMinutes: 25 },
    ],
  },
];

export const MOCK_MY_COUNTER: MyCounterDto = {
  counterNumber: 3,
  branchName: "QGo KL Main Branch",
  serviceLaneName: "Personal Banking, Business Banking",
  mode: "Active",
  branchId: "preview-branch-1",
  allowedServiceTypeIds: ["svc-personal", "svc-business"],
};

export const MOCK_LIVE: LiveDashboard = {
  customersInBranch: 14,
  queueLength: 8,
  servingCount: 6,
  avgTicketToCallMinutes: 11,
  longestTicketToCallMinutes: 21,
  activeCounters: 5,
  customersServedToday: 47,
  walkInsToday: 28,
  appointmentsToday: 19,
  walkInsWaiting: 5,
  onlineWaiting: 3,
  ticketToCallBreaches: 2,
  onlineCheckInsWaiting: 3,
  byService: [
    { serviceTypeId: "svc-personal", queueLength: 5, estimatedWaitMinutes: 9 },
    { serviceTypeId: "svc-business", queueLength: 2, estimatedWaitMinutes: 14 },
    { serviceTypeId: "svc-loan", queueLength: 1, estimatedWaitMinutes: 22 },
  ],
};

export const MOCK_WAITING: WaitingTicketDto[] = [
  { ticketNumber: "A015", entryType: "Online", position: 1, estimatedWaitMinutes: 5 },
  { ticketNumber: "A016", entryType: "Walk-in", position: 2, estimatedWaitMinutes: 12 },
  { ticketNumber: "A017", entryType: "Online", position: 3, estimatedWaitMinutes: 18 },
  { ticketNumber: "B004", entryType: "Walk-in", position: 4, estimatedWaitMinutes: 24 },
];

export const MOCK_COUNTERS: ManagerCounterRowDto[] = [
  {
    id: "ctr-1",
    number: 1,
    mode: "Active",
    assignedStaffEmail: "staff.teller@local.test",
    allowedLanesDisplay: "Personal Banking",
    allowedServiceTypeIds: ["svc-personal"],
    currentDedicatedServiceTypeId: "svc-personal",
    currentDedicatedLaneName: "Personal Banking",
  },
  {
    id: "ctr-2",
    number: 2,
    mode: "Break",
    assignedStaffEmail: "teller2@local.test",
    allowedLanesDisplay: "Business Banking",
    allowedServiceTypeIds: ["svc-business"],
    currentDedicatedServiceTypeId: "svc-business",
    currentDedicatedLaneName: "Business Banking",
  },
  {
    id: "ctr-3",
    number: 3,
    mode: "Active",
    assignedStaffEmail: "staff.teller@local.test",
    allowedLanesDisplay: "Personal, Business",
    allowedServiceTypeIds: ["svc-personal", "svc-business"],
    currentDedicatedServiceTypeId: "svc-personal",
    currentDedicatedLaneName: "Personal Banking",
  },
  {
    id: "ctr-4",
    number: 4,
    mode: "Closed",
    assignedStaffEmail: null,
    allowedLanesDisplay: "Loan Consultation",
    allowedServiceTypeIds: ["svc-loan"],
    currentDedicatedServiceTypeId: null,
    currentDedicatedLaneName: null,
  },
];

export const MOCK_STAFF: AssignableStaffDto[] = [
  { id: "s1", email: "staff.teller@local.test", name: "Ahmad Teller", role: "Staff" },
  { id: "s2", email: "teller2@local.test", name: "Siti Teller", role: "Staff" },
  { id: "s3", email: "manager@local.test", name: "Branch Manager", role: "Manager" },
];

export const MOCK_SETTINGS: BranchOperationalSettings = {
  slotDurationMinutes: 30,
  serviceZoneOffsetMinutes: 480,
  maxSlotTotalCapacity: null,
  onlineEarlyCallMinutes: 10,
  calledAbsentGraceMinutes: 5,
  nextWeekBookingOpensOnDay: 6,
  weeklyOperatingHours: defaultWeeklyHours(),
};

export const MOCK_INSIGHTS: ManagerInsights = {
  noShowsToday: 2,
  alerts: [
    { severity: "Warning", message: "Personal Banking queue depth is elevated — consider opening Counter 4." },
    { severity: "Info", message: "Next booking window is 85% full for Personal Banking." },
  ],
  suggestions: [
    {
      kind: "OpenCounter",
      title: "Open Counter 4",
      detail: "Loan lane has 1 waiting customer and no active counter.",
      relatedCounterId: "ctr-4",
      relatedCounterNumber: 4,
      relatedServiceTypeId: "svc-loan",
    },
  ],
  lanes: [
    {
      serviceTypeId: "svc-personal",
      serviceName: "Personal Banking",
      waitingCount: 5,
      activeCountersForLane: 2,
      estimatedWaitMinutes: 9,
      avgServiceMinutesObserved: 11,
      completedToday: 28,
      nextWindowOnlineCapacity: 4,
      nextWindowWalkCapacity: 2,
      nextWindowSlotStartIso: "2026-08-11T14:30:00+08:00",
    },
    {
      serviceTypeId: "svc-business",
      serviceName: "Business Banking",
      waitingCount: 2,
      activeCountersForLane: 1,
      estimatedWaitMinutes: 14,
      avgServiceMinutesObserved: 16,
      completedToday: 12,
      nextWindowOnlineCapacity: 2,
      nextWindowWalkCapacity: 1,
      nextWindowSlotStartIso: "2026-08-11T14:30:00+08:00",
    },
    {
      serviceTypeId: "svc-loan",
      serviceName: "Loan Consultation",
      waitingCount: 1,
      activeCountersForLane: 0,
      estimatedWaitMinutes: 22,
      avgServiceMinutesObserved: 24,
      completedToday: 7,
      nextWindowOnlineCapacity: 1,
      nextWindowWalkCapacity: 0,
      nextWindowSlotStartIso: "2026-08-11T15:00:00+08:00",
    },
  ],
};

export const MOCK_ANALYTICS: BranchAnalyticsToday = {
  ticketsToday: 127,
  customersServed: 127,
  ticketToCall: { avgMinutes: 8.4, medianMinutes: 6.2, longestMinutes: 27.7, slaMetCount: 105, slaExceededCount: 22 },
  serviceDuration: { avgMinutes: 5.2, medianMinutes: 4.6, longestMinutes: 31.3, slaMetCount: null, slaExceededCount: null },
  ticketToCallSlaPercent: 82.4,
  slaTargetMinutes: 15,
  ticketStatus: { ticketsToday: 127, served: 99, waiting: 12, serving: 5, noShow: 7, cancelled: 4 },
  walkIn: { tickets: 82, served: 58, noShows: 5, noShowRatePercent: 6.1, avgTicketToCallMinutes: 10.2 },
  online: { tickets: 45, served: 41, noShows: 2, noShowRatePercent: 4.4, avgTicketToCallMinutes: 5.1 },
  ticketsByHour: [
    { hourLabel: "09:00", count: 12 },
    { hourLabel: "10:00", count: 18 },
    { hourLabel: "11:00", count: 24 },
    { hourLabel: "12:00", count: 42 },
    { hourLabel: "13:00", count: 39 },
    { hourLabel: "14:00", count: 22 },
    { hourLabel: "15:00", count: 14 },
  ],
  peak: {
    periodLabel: "12:00 – 13:00",
    ticketCount: 42,
    aboveAveragePercent: 36,
    topServiceName: "Personal Banking",
    activeCounters: 4,
    totalCounters: 6,
  },
  ticketToCallDistribution: [
    { label: "0–5 min", count: 52 },
    { label: "5–10 min", count: 38 },
    { label: "10–15 min", count: 21 },
    { label: "15–20 min", count: 11 },
    { label: "20+ min", count: 5 },
  ],
  lanePerformance: [
    { serviceTypeId: "svc-personal", serviceName: "Personal Banking", served: 58, avgTicketToCallMinutes: 5.3, maxTicketToCallMinutes: 18.2, avgServiceMinutes: 4.2, ticketToCallSlaPercent: 92 },
    { serviceTypeId: "svc-business", serviceName: "Business Banking", served: 41, avgTicketToCallMinutes: 9.1, maxTicketToCallMinutes: 27.4, avgServiceMinutes: 7.8, ticketToCallSlaPercent: 81 },
    { serviceTypeId: "svc-loan", serviceName: "Loan Consultation", served: 28, avgTicketToCallMinutes: 19.3, maxTicketToCallMinutes: 42.1, avgServiceMinutes: 24.5, ticketToCallSlaPercent: 64 },
  ],
  counterUtilization: [
    { counterId: "ctr-1", counterNumber: 1, staffEmail: "staff.teller@local.test", mode: "Active", servedToday: 31, utilizationPercent: 91 },
    { counterId: "ctr-2", counterNumber: 2, staffEmail: "teller2@local.test", mode: "Break", servedToday: 27, utilizationPercent: 82 },
    { counterId: "ctr-3", counterNumber: 3, staffEmail: "staff.teller@local.test", mode: "Active", servedToday: 35, utilizationPercent: 61 },
    { counterId: "ctr-4", counterNumber: 4, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 21 },
  ],
  noShowsByHour: [
    { hourLabel: "10:00", count: 1 },
    { hourLabel: "12:00", count: 4 },
    { hourLabel: "13:00", count: 2 },
  ],
};
