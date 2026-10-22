import type {
  AssignableStaffDto,
  BranchAnalyticsToday,
  BranchClosure,
  BranchDto,
  BranchQueueDto,
  ManagerAppointmentsToday,
  ManagerWaitingTicket,
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
  longestTicketToCallMinutes: 18,
  activeCounters: 5,
  customersServedToday: 47,
  walkInsToday: 28,
  appointmentsToday: 19,
  walkInsWaiting: 5,
  onlineWaiting: 3,
  ticketToCallBreaches: 1,
  onlineCheckInsWaiting: 3,
  byService: [
    { serviceTypeId: "svc-personal", queueLength: 5, estimatedWaitMinutes: 9 },
    { serviceTypeId: "svc-business", queueLength: 2, estimatedWaitMinutes: 14 },
    { serviceTypeId: "svc-loan", queueLength: 1, estimatedWaitMinutes: 22 },
  ],
};

export const MOCK_WAITING: WaitingTicketDto[] = [
  {
    ticketNumber: "A015",
    entryType: "Online",
    position: 1,
    estimatedWaitMinutes: null,
    serviceName: "Personal Banking",
    checkedIn: true,
  },
  {
    ticketNumber: "A016",
    entryType: "Walk-in",
    position: 2,
    estimatedWaitMinutes: null,
    serviceName: "Personal Banking",
    checkedIn: false,
  },
  {
    ticketNumber: "A017",
    entryType: "Online",
    position: 3,
    estimatedWaitMinutes: null,
    serviceName: "Personal Banking",
    checkedIn: true,
  },
  {
    ticketNumber: "B004",
    entryType: "Walk-in",
    position: 4,
    estimatedWaitMinutes: null,
    serviceName: "Personal Banking",
    checkedIn: false,
  },
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
  missedToday: 2,
  alerts: [
    {
      severity: "warning",
      message: "Personal Banking: 5 waiting, longest 28 min — open a counter for A (counter #4)",
      kind: "queue_pressure",
      serviceTypeId: "svc-personal",
      suggestedAction: "open_counter",
      suggestedCounterNumber: 4,
    },
    { severity: "Info", message: "Next booking window is 85% full for Personal Banking." },
  ],
  suggestions: [
    {
      kind: "open_counter",
      title: "Open counter #4",
      detail: "Personal Banking (A): 5 waiting, longest 28 min, 2 counter(s) serving. Set counter #4 to Active and tick Personal Banking.",
      relatedCounterId: "ctr-4",
      relatedCounterNumber: 4,
      relatedServiceTypeId: "svc-personal",
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
  customersServed: 99,
  ticketToCall: { avgMinutes: 8.4, medianMinutes: 6.2, longestMinutes: 27.7, slaMetCount: 115, slaExceededCount: 12 },
  serviceDuration: { avgMinutes: 5.2, medianMinutes: 4.6, longestMinutes: 31.3, slaMetCount: null, slaExceededCount: null },
  ticketToCallSlaPercent: 90.6,
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
    // overTarget: over the ticket's own lane target (A 15, B 20, C 30 min).
    { label: "0–5 min", count: 52, overTarget: 0 },
    { label: "5–10 min", count: 38, overTarget: 0 },
    { label: "10–15 min", count: 21, overTarget: 0 },
    { label: "15–20 min", count: 11, overTarget: 8 },
    { label: "20+ min", count: 5, overTarget: 4 },
  ],
  lanePerformance: [
    { serviceTypeId: "svc-personal", serviceName: "Personal Banking", served: 48, avgTicketToCallMinutes: 5.3, maxTicketToCallMinutes: 18.2, avgServiceMinutes: 4.2, ticketToCallSlaPercent: 92 },
    { serviceTypeId: "svc-business", serviceName: "Business Banking", served: 33, avgTicketToCallMinutes: 9.1, maxTicketToCallMinutes: 27.4, avgServiceMinutes: 7.8, ticketToCallSlaPercent: 81 },
    { serviceTypeId: "svc-loan", serviceName: "Loan Consultation", served: 18, avgTicketToCallMinutes: 19.3, maxTicketToCallMinutes: 42.1, avgServiceMinutes: 24.5, ticketToCallSlaPercent: 64 },
  ],
  counterUtilization: [
    { counterId: "ctr-1", counterNumber: 1, staffEmail: "staff.teller@local.test", mode: "Active", servedToday: 31, utilizationPercent: 91 },
    { counterId: "ctr-2", counterNumber: 2, staffEmail: "teller2@local.test", mode: "Break", servedToday: 27, utilizationPercent: 82 },
    { counterId: "ctr-3", counterNumber: 3, staffEmail: "staff.teller@local.test", mode: "Active", servedToday: 35, utilizationPercent: 61 },
    { counterId: "ctr-4", counterNumber: 4, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 21 },
  ],
  queuePerformance: [
    { queueId: "q-a", name: "Personal Banking", ticketPrefix: "A", waiting: 5, serving: 3, servedToday: 48, avgTicketToCallMinutes: 5.3, slaBreachWaiting: 1, serviceLevelMinutes: 15 },
    { queueId: "q-b", name: "Business Banking", ticketPrefix: "B", waiting: 2, serving: 2, servedToday: 33, avgTicketToCallMinutes: 9.1, slaBreachWaiting: 0, serviceLevelMinutes: 20 },
    { queueId: "q-c", name: "Loan Consultation", ticketPrefix: "C", waiting: 1, serving: 0, servedToday: 18, avgTicketToCallMinutes: 19.3, slaBreachWaiting: 0, serviceLevelMinutes: 30 },
  ],
  noShowsByHour: [
    { hourLabel: "10:00", count: 1 },
    { hourLabel: "12:00", count: 4 },
    { hourLabel: "13:00", count: 2 },
  ],
};

/**
 * Sparse "first hour of the day" scenario for the Analytics preview
 * (/preview/manager?tab=analytics&mock=sparse): 3 online tickets at 11:00, nothing served yet.
 */
export const MOCK_ANALYTICS_SPARSE: BranchAnalyticsToday = {
  ticketsToday: 3,
  customersServed: 0,
  ticketToCall: { avgMinutes: 0, medianMinutes: null, longestMinutes: null, slaMetCount: null, slaExceededCount: null },
  serviceDuration: { avgMinutes: 0, medianMinutes: null, longestMinutes: null, slaMetCount: null, slaExceededCount: null },
  ticketToCallSlaPercent: null,
  ticketStatus: { ticketsToday: 3, served: 0, waiting: 1, serving: 2, noShow: 0, cancelled: 0 },
  walkIn: { tickets: 0, served: 0, noShows: 0, noShowRatePercent: null, avgTicketToCallMinutes: null },
  online: { tickets: 3, served: 0, noShows: 0, noShowRatePercent: 0, avgTicketToCallMinutes: null },
  ticketsByHour: [{ hourLabel: "11:00", count: 3 }],
  peak: {
    periodLabel: "11:00 – 12:00",
    ticketCount: 3,
    aboveAveragePercent: null,
    topServiceName: "Insurance / Bancassurance",
    activeCounters: 2,
    totalCounters: 8,
  },
  ticketToCallDistribution: [
    { label: "0–5 min", count: 0 },
    { label: "5–10 min", count: 0 },
    { label: "10–15 min", count: 0 },
    { label: "15–20 min", count: 0 },
    { label: "20+ min", count: 0 },
  ],
  lanePerformance: [
    { serviceTypeId: "svc-account-opening", serviceName: "Account Opening", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-atm-cdm-services", serviceName: "ATM / CDM Services", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-business-banking", serviceName: "Business Banking", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-credit-card-services", serviceName: "Credit Card Services", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-deposit-services", serviceName: "Deposit Services", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-fixed-deposit", serviceName: "Fixed Deposit", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-insurance-bancassurance", serviceName: "Insurance / Bancassurance", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-investment-unit-trust", serviceName: "Investment / Unit Trust", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-loan-financing", serviceName: "Loan / Financing", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-online-banking-support", serviceName: "Online Banking Support", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-queue-customer-service", serviceName: "Queue / Customer Service", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-remittance-transfer", serviceName: "Remittance / Transfer", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
    { serviceTypeId: "svc-withdrawal-services", serviceName: "Withdrawal Services", served: 0, avgTicketToCallMinutes: null, maxTicketToCallMinutes: null, avgServiceMinutes: null, ticketToCallSlaPercent: null },
  ],
  counterUtilization: [
    { counterId: "sp-ctr-1", counterNumber: 1, staffEmail: "teller1@local.test", mode: "Active", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-2", counterNumber: 2, staffEmail: "teller2@local.test", mode: "Active", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-3", counterNumber: 3, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-4", counterNumber: 4, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-5", counterNumber: 5, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-6", counterNumber: 6, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-7", counterNumber: 7, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 0 },
    { counterId: "sp-ctr-8", counterNumber: 8, staffEmail: null, mode: "Closed", servedToday: 0, utilizationPercent: 0 },
  ],
  queuePerformance: [
    { queueId: "q-account-opening", name: "Account Opening", ticketPrefix: "A", waiting: 0, serving: 1, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-atm-cdm-services", name: "ATM / CDM Services", ticketPrefix: "B", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-business-banking", name: "Business Banking", ticketPrefix: "C", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-credit-card-services", name: "Credit Card Services", ticketPrefix: "D", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-deposit-services", name: "Deposit Services", ticketPrefix: "E", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-fixed-deposit", name: "Fixed Deposit", ticketPrefix: "F", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-insurance-bancassurance", name: "Insurance / Bancassurance", ticketPrefix: "G", waiting: 1, serving: 1, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-investment-unit-trust", name: "Investment / Unit Trust", ticketPrefix: "H", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-loan-financing", name: "Loan / Financing", ticketPrefix: "I", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-online-banking-support", name: "Online Banking Support", ticketPrefix: "J", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-queue-customer-service", name: "Queue / Customer Service", ticketPrefix: "K", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-remittance-transfer", name: "Remittance / Transfer", ticketPrefix: "L", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
    { queueId: "q-withdrawal-services", name: "Withdrawal Services", ticketPrefix: "M", waiting: 0, serving: 0, servedToday: 0, avgTicketToCallMinutes: null, slaBreachWaiting: 0, serviceLevelMinutes: 15 },
  ],
  noShowsByHour: [],
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const todayAt = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const MOCK_MANAGER_WAITING: ManagerWaitingTicket[] = [
  { id: "w1", ticketNumber: "A015", serviceName: "Personal Banking", entryType: "OnlineBooked", position: 1, createdAt: minutesAgo(25), assignedSlotStart: minutesAgo(12), assignedSlotEnd: minutesAgo(-18), checkedIn: true, estimatedWaitMinutes: 2, waitStartAt: minutesAgo(18), serviceLevelMinutes: 15 },
  { id: "w2", ticketNumber: "A016", serviceName: "Personal Banking", entryType: "WalkIn", position: 2, createdAt: minutesAgo(14), assignedSlotStart: null, checkedIn: true, estimatedWaitMinutes: 6, waitStartAt: minutesAgo(14), serviceLevelMinutes: 15 },
  { id: "w3", ticketNumber: "B004", serviceName: "Business Banking", entryType: "WalkIn", position: 3, createdAt: minutesAgo(11), assignedSlotStart: null, checkedIn: true, estimatedWaitMinutes: 9, waitStartAt: minutesAgo(11), serviceLevelMinutes: 20 },
  { id: "w4", ticketNumber: "A017", serviceName: "Personal Banking", entryType: "OnlineBooked", position: 4, createdAt: minutesAgo(7), assignedSlotStart: minutesAgo(5), assignedSlotEnd: minutesAgo(-25), checkedIn: true, estimatedWaitMinutes: 12, waitStartAt: minutesAgo(5), serviceLevelMinutes: 15 },
  { id: "w5", ticketNumber: "C002", serviceName: "Loan Consultation", entryType: "WalkIn", position: 5, createdAt: minutesAgo(3), assignedSlotStart: null, checkedIn: true, estimatedWaitMinutes: 22, waitStartAt: minutesAgo(3), serviceLevelMinutes: 30 },
];

export const MOCK_QUEUES: BranchQueueDto[] = [
  { id: "q-a", name: "Personal Banking", ticketPrefix: "A", serviceLevelMinutes: 15, isActive: true, waitingCount: 5, servingCount: 3, longestWaitMinutes: 18, slaBreachCount: 1, serviceNames: ["Personal Banking"], serviceTypeIds: ["svc-personal"] },
  { id: "q-b", name: "Business Banking", ticketPrefix: "B", serviceLevelMinutes: 20, isActive: true, waitingCount: 2, servingCount: 2, longestWaitMinutes: 11, slaBreachCount: 0, serviceNames: ["Business Banking"], serviceTypeIds: ["svc-business"] },
  { id: "q-c", name: "Loan Consultation", ticketPrefix: "C", serviceLevelMinutes: 30, isActive: false, waitingCount: 1, servingCount: 0, longestWaitMinutes: 3, slaBreachCount: 0, serviceNames: ["Loan Consultation"], serviceTypeIds: ["svc-loan"] },
];

// 10 = 3 upcoming + 2 checked in + 2 completed + 3 missed group (1 no-show, 1 missed, 1 cancelled).
export const MOCK_APPOINTMENTS: ManagerAppointmentsToday = {
  totalBookings: 10,
  confirmed: 3,
  checkedIn: 2,
  noShow: 1,
  cancelled: 1,
  missed: 1,
  appointments: [
    { bookingId: "b1", customerName: "Tan Wei Ming", serviceName: "Personal Banking", slotStart: todayAt(9, 0), slotEnd: todayAt(9, 30), status: "Completed" },
    { bookingId: "b2", customerName: "Nur Aisyah", serviceName: "Business Banking", slotStart: todayAt(9, 30), slotEnd: todayAt(10, 0), status: "Completed" },
    { bookingId: "b3", customerName: "Rajesh Kumar", serviceName: "Loan Consultation", slotStart: todayAt(10, 0), slotEnd: todayAt(10, 30), status: "NoShow" },
    { bookingId: "b10", customerName: "Farah Hassan", serviceName: "Business Banking", slotStart: todayAt(10, 30), slotEnd: todayAt(11, 0), status: "Missed" },
    { bookingId: "b4", customerName: "Lim Mei Ling", serviceName: "Personal Banking", slotStart: todayAt(11, 0), slotEnd: todayAt(11, 30), status: "Cancelled" },
    { bookingId: "b5", customerName: "Ahmad Faizal", serviceName: "Personal Banking", slotStart: todayAt(14, 0), slotEnd: todayAt(14, 30), status: "CheckedIn" },
    { bookingId: "b6", customerName: "Chong Kar Wai", serviceName: "Business Banking", slotStart: todayAt(14, 30), slotEnd: todayAt(15, 0), status: "CheckedIn" },
    { bookingId: "b7", customerName: "Siti Hajar", serviceName: "Personal Banking", slotStart: todayAt(15, 0), slotEnd: todayAt(15, 30), status: "Confirmed" },
    { bookingId: "b8", customerName: "David Wong", serviceName: "Loan Consultation", slotStart: todayAt(15, 30), slotEnd: todayAt(16, 0), status: "Confirmed" },
    { bookingId: "b9", customerName: "Priya Nair", serviceName: "Personal Banking", slotStart: todayAt(16, 0), slotEnd: todayAt(16, 30), status: "Confirmed" },
  ],
};

export const MOCK_CLOSURES: BranchClosure[] = [
  { id: "cl1", closedFrom: "2026-10-31T00:00:00+08:00", closedTo: "2026-11-01T00:00:00+08:00", reason: "Deepavali" },
  { id: "cl2", closedFrom: "2026-12-25T00:00:00+08:00", closedTo: "2026-12-26T00:00:00+08:00", reason: "Christmas Day" },
];

/* ── Sparse scenario (?mock=sparse): start of the day, 3 online tickets at 11:00 ──
   2 serving, 1 waiting; 13 services mostly idle; counters 1–2 open (teller1 / teller2), 3–8 closed and unassigned. */

const SPARSE_SERVICES = MOCK_ANALYTICS_SPARSE.lanePerformance.map((l) => ({
  id: l.serviceTypeId,
  code: l.serviceTypeId.replace("svc-", "").slice(0, 4).toUpperCase(),
  name: l.serviceName,
  defaultAvgServiceMinutes: 15,
}));
const svcId = (name: string) => SPARSE_SERVICES.find((s) => s.name === name)!.id;

export const MOCK_BRANCHES_SPARSE: BranchDto[] = [{ ...MOCK_BRANCHES[0], name: "Bandar Sri Damansara", services: SPARSE_SERVICES }];

export const MOCK_STAFF_SPARSE: AssignableStaffDto[] = [
  { id: "sp-s1", email: "teller1@local.test", name: "Teller One", role: "Staff" },
  { id: "sp-s2", email: "teller2@local.test", name: "Teller Two", role: "Staff" },
  { id: "sp-s3", email: "manager@local.test", name: "Branch Manager", role: "Manager" },
];

const SPARSE_COUNTER_LANES: Record<number, string[]> = {
  1: ["Account Opening", "Deposit Services", "Fixed Deposit"],
  2: ["Insurance / Bancassurance", "Investment / Unit Trust"],
};

export const MOCK_COUNTERS_SPARSE: ManagerCounterRowDto[] = Array.from({ length: 8 }, (_, i) => {
  const n = i + 1;
  const lanes = SPARSE_COUNTER_LANES[n] ?? ["Queue / Customer Service"];
  return {
    id: `sp-ctr-${n}`,
    number: n,
    mode: n <= 2 ? "Active" : "Closed",
    assignedStaffEmail: n <= 2 ? `teller${n}@local.test` : null,
    allowedLanesDisplay: lanes.join(", "),
    allowedServiceTypeIds: lanes.map(svcId),
    currentDedicatedServiceTypeId: n <= 2 ? svcId(lanes[0]) : null,
    currentDedicatedLaneName: n <= 2 ? lanes[0] : null,
  };
});

export const MOCK_LIVE_SPARSE: LiveDashboard = {
  customersInBranch: 3,
  queueLength: 1,
  servingCount: 2,
  avgTicketToCallMinutes: 0,
  longestTicketToCallMinutes: 4,
  activeCounters: 2,
  customersServedToday: 0,
  walkInsToday: 0,
  appointmentsToday: 3,
  walkInsWaiting: 0,
  onlineWaiting: 1,
  ticketToCallBreaches: 0,
  onlineCheckInsWaiting: 1,
  byService: [{ serviceTypeId: svcId("Insurance / Bancassurance"), queueLength: 1, estimatedWaitMinutes: 8 }],
};

export const MOCK_QUEUES_SPARSE: BranchQueueDto[] = (MOCK_ANALYTICS_SPARSE.queuePerformance ?? []).map((q) => ({
  id: q.queueId,
  name: q.name,
  ticketPrefix: q.ticketPrefix,
  serviceLevelMinutes: q.serviceLevelMinutes,
  isActive: true,
  waitingCount: q.waiting,
  servingCount: q.serving,
  longestWaitMinutes: q.waiting > 0 ? 4 : null,
  slaBreachCount: q.slaBreachWaiting,
  serviceNames: [q.name],
  serviceTypeIds: [svcId(q.name)],
}));

export const MOCK_INSIGHTS_SPARSE: ManagerInsights = {
  missedToday: 0,
  alerts: [],
  suggestions: [],
  lanes: SPARSE_SERVICES.map((s) => ({
    serviceTypeId: s.id,
    serviceName: s.name,
    waitingCount: s.name === "Insurance / Bancassurance" ? 1 : 0,
    activeCountersForLane: SPARSE_COUNTER_LANES[1].includes(s.name) || SPARSE_COUNTER_LANES[2].includes(s.name) ? 1 : 0,
    estimatedWaitMinutes: s.name === "Insurance / Bancassurance" ? 8 : null,
    avgServiceMinutesObserved: 0,
    completedToday: 0,
    nextWindowOnlineCapacity: 4,
    nextWindowWalkCapacity: 2,
    nextWindowSlotStartIso: todayAt(11, 30),
  })),
};

export const MOCK_MANAGER_WAITING_SPARSE: ManagerWaitingTicket[] = [
  {
    id: "sp-w1",
    ticketNumber: "G002",
    serviceName: "Insurance / Bancassurance",
    entryType: "OnlineBooked",
    position: 1,
    createdAt: minutesAgo(4),
    assignedSlotStart: todayAt(11, 0),
    assignedSlotEnd: todayAt(11, 30),
    checkedIn: true,
    estimatedWaitMinutes: 8,
    waitStartAt: minutesAgo(4),
    serviceLevelMinutes: 15,
  },
];

export const MOCK_APPOINTMENTS_SPARSE: ManagerAppointmentsToday = {
  totalBookings: 3,
  confirmed: 0,
  checkedIn: 3,
  noShow: 0,
  cancelled: 0,
  missed: 0,
  appointments: [
    { bookingId: "sp-b1", customerName: "Aina Rahman", serviceName: "Account Opening", slotStart: todayAt(11, 0), slotEnd: todayAt(11, 30), status: "Serving" },
    { bookingId: "sp-b2", customerName: "Marcus Lee", serviceName: "Insurance / Bancassurance", slotStart: todayAt(11, 0), slotEnd: todayAt(11, 30), status: "Serving" },
    { bookingId: "sp-b3", customerName: "Kavitha Raj", serviceName: "Insurance / Bancassurance", slotStart: todayAt(11, 0), slotEnd: todayAt(11, 30), status: "CheckedIn" },
  ],
};

export const MOCK_WALK_IN_LINK = {
  branchId: "preview-branch-1",
  qrUrl: "https://qgo.example.my/walk-in?b=101&t=K7Q2-9XMD",
  token: "K7Q2-9XMD",
  branchLocalDate: new Date().toISOString().slice(0, 10),
  validUntil: (() => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  })(),
};

/* ── Empty scenario (?mock=empty): branch open, nothing has happened yet ──
   No tickets, no bookings, every counter closed and unassigned (counters 3–8 have no lanes yet), zero analytics. */

const ZERO_STAT = { avgMinutes: 0, medianMinutes: null, longestMinutes: null, slaMetCount: null, slaExceededCount: null };

export const MOCK_ANALYTICS_EMPTY: BranchAnalyticsToday = {
  ...MOCK_ANALYTICS_SPARSE,
  ticketsToday: 0,
  customersServed: 0,
  ticketToCall: ZERO_STAT,
  serviceDuration: ZERO_STAT,
  ticketStatus: { ticketsToday: 0, served: 0, waiting: 0, serving: 0, noShow: 0, cancelled: 0 },
  walkIn: { tickets: 0, served: 0, noShows: 0, noShowRatePercent: null, avgTicketToCallMinutes: null },
  online: { tickets: 0, served: 0, noShows: 0, noShowRatePercent: null, avgTicketToCallMinutes: null },
  ticketsByHour: [],
  peak: null,
  counterUtilization: MOCK_ANALYTICS_SPARSE.counterUtilization.map((c) => ({ ...c, staffEmail: null, mode: "Closed" })),
  queuePerformance: (MOCK_ANALYTICS_SPARSE.queuePerformance ?? []).map((q) => ({ ...q, waiting: 0, serving: 0 })),
};

export const MOCK_COUNTERS_EMPTY: ManagerCounterRowDto[] = MOCK_COUNTERS_SPARSE.map((c) => ({
  ...c,
  mode: "Closed",
  assignedStaffEmail: null,
  allowedLanesDisplay: c.number <= 2 ? c.allowedLanesDisplay : "",
  allowedServiceTypeIds: c.number <= 2 ? c.allowedServiceTypeIds : [],
  currentDedicatedServiceTypeId: null,
  currentDedicatedLaneName: null,
}));

export const MOCK_LIVE_EMPTY: LiveDashboard = {
  ...MOCK_LIVE_SPARSE,
  customersInBranch: 0,
  queueLength: 0,
  servingCount: 0,
  avgTicketToCallMinutes: 0,
  longestTicketToCallMinutes: 0,
  activeCounters: 0,
  appointmentsToday: 0,
  onlineWaiting: 0,
  onlineCheckInsWaiting: 0,
  byService: [],
};

export const MOCK_QUEUES_EMPTY: BranchQueueDto[] = MOCK_QUEUES_SPARSE.map((q) => ({ ...q, waitingCount: 0, servingCount: 0, longestWaitMinutes: null }));

export const MOCK_INSIGHTS_EMPTY: ManagerInsights = {
  ...MOCK_INSIGHTS_SPARSE,
  lanes: MOCK_INSIGHTS_SPARSE.lanes.map((l) => ({ ...l, waitingCount: 0, activeCountersForLane: 0, estimatedWaitMinutes: null })),
};

export const MOCK_APPOINTMENTS_EMPTY: ManagerAppointmentsToday = { totalBookings: 0, confirmed: 0, checkedIn: 0, noShow: 0, cancelled: 0, missed: 0, appointments: [] };

export type PreviewMock = "normal" | "sparse" | "empty";

/** All preview data for one scenario. */
export function previewScenario(mock: PreviewMock) {
  if (mock === "empty") {
    return {
      branches: MOCK_BRANCHES_SPARSE,
      counters: MOCK_COUNTERS_EMPTY,
      staff: MOCK_STAFF_SPARSE,
      live: MOCK_LIVE_EMPTY,
      insights: MOCK_INSIGHTS_EMPTY,
      analytics: MOCK_ANALYTICS_EMPTY,
      waiting: [] as ManagerWaitingTicket[],
      queues: MOCK_QUEUES_EMPTY,
      appointments: MOCK_APPOINTMENTS_EMPTY,
    };
  }
  return mock === "sparse"
    ? {
        branches: MOCK_BRANCHES_SPARSE,
        counters: MOCK_COUNTERS_SPARSE,
        staff: MOCK_STAFF_SPARSE,
        live: MOCK_LIVE_SPARSE,
        insights: MOCK_INSIGHTS_SPARSE,
        analytics: MOCK_ANALYTICS_SPARSE,
        waiting: MOCK_MANAGER_WAITING_SPARSE,
        queues: MOCK_QUEUES_SPARSE,
        appointments: MOCK_APPOINTMENTS_SPARSE,
      }
    : {
        branches: MOCK_BRANCHES,
        counters: MOCK_COUNTERS,
        staff: MOCK_STAFF,
        live: MOCK_LIVE,
        insights: MOCK_INSIGHTS,
        analytics: MOCK_ANALYTICS,
        waiting: MOCK_MANAGER_WAITING,
        queues: MOCK_QUEUES,
        appointments: MOCK_APPOINTMENTS,
      };
}
