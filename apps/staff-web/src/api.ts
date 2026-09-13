import { API_BASE } from "./config";
import {
  getValidStaffAccessToken,
  revokeStaffRefreshRemote,
  subscribeStaffSession,
} from "./staffSession";
export { getValidStaffAccessToken, revokeStaffRefreshRemote, subscribeStaffSession };
export {
  clearStoredSession,
  getStoredBranchId,
  getStoredEmail,
  getStoredRefreshToken,
  getStoredRole,
  getStoredToken,
  setStoredBranchId,
  setStoredEmail,
  setStoredRefreshToken,
  setStoredRole,
  setStoredToken,
} from "./staffStorage";

export type LoginResponse = {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  role: string;
  branchId: string | null;
};

async function staffAuthHeaders(): Promise<{ Authorization: string }> {
  const t = await getValidStaffAccessToken();
  if (!t) throw new Error("Not signed in.");
  return { Authorization: `Bearer ${t}` };
}

export type ServiceDto = { id: string; code: string; name: string; defaultAvgServiceMinutes: number };

export type BranchOperatingHourRow = {
  dayOfWeek: string;
  isClosed: boolean;
  openMinutesFromMidnight: number | null;
  closeMinutesFromMidnight: number | null;
};

export type BranchDto = {
  id: string;
  branchCode: number;
  name: string;
  address?: string;
  state?: string;
  openingStatus?: string;
  serviceZoneOffsetMinutes?: number;
  services: ServiceDto[];
  weeklyOperatingHours?: BranchOperatingHourRow[];
};

export type CallNextResponse = { ticketNumber: string | null; counterNumber: number | null; message: string | null };

export type LiveDashboard = {
  customersInBranch: number;
  queueLength: number;
  servingCount: number;
  /** Average ticket-to-call for completed visits today (same formula as Analytics). */
  avgTicketToCallMinutes: number;
  longestTicketToCallMinutes: number;
  activeCounters: number;
  customersServedToday: number;
  walkInsToday: number;
  appointmentsToday: number;
  walkInsWaiting: number;
  onlineWaiting: number;
  ticketToCallBreaches: number;
  /** Online bookings checked in and still waiting (not queue priority). */
  onlineCheckInsWaiting: number;
  byService: { serviceTypeId: string; queueLength: number; estimatedWaitMinutes: number | null }[];
};

export type HourlyCount = { hourLabel: string; count: number };
export type WaitBucket = { label: string; count: number };
export type TimingSummary = {
  avgMinutes: number;
  medianMinutes: number | null;
  longestMinutes: number | null;
  slaMetCount: number | null;
  slaExceededCount: number | null;
};
export type TicketStatusSummary = {
  ticketsToday: number;
  served: number;
  waiting: number;
  serving: number;
  noShow: number;
  cancelled: number;
};
export type ChannelAnalytics = {
  tickets: number;
  served: number;
  noShows: number;
  noShowRatePercent: number | null;
  avgTicketToCallMinutes: number | null;
};
export type OperationalPeak = {
  periodLabel: string;
  ticketCount: number;
  aboveAveragePercent: number | null;
  topServiceName: string | null;
  activeCounters: number;
  totalCounters: number;
};
export type CounterUtilizationRow = {
  counterId: string;
  counterNumber: number;
  staffEmail: string | null;
  mode: string;
  servedToday: number;
  utilizationPercent: number;
};
export type LanePerformance = {
  serviceTypeId: string;
  serviceName: string;
  served: number;
  avgTicketToCallMinutes: number | null;
  maxTicketToCallMinutes: number | null;
  avgServiceMinutes: number | null;
  ticketToCallSlaPercent: number | null;
};

export type BranchAnalyticsToday = {
  ticketsToday: number;
  customersServed: number;
  ticketToCall: TimingSummary;
  serviceDuration: TimingSummary;
  ticketToCallSlaPercent: number | null;
  slaTargetMinutes: number;
  ticketStatus: TicketStatusSummary;
  walkIn: ChannelAnalytics;
  online: ChannelAnalytics;
  ticketsByHour: HourlyCount[];
  peak: OperationalPeak | null;
  ticketToCallDistribution: WaitBucket[];
  lanePerformance: LanePerformance[];
  counterUtilization: CounterUtilizationRow[];
  noShowsByHour: HourlyCount[];
};

export type ManagerWaitingTicket = {
  ticketNumber: string;
  serviceName: string;
  entryType: string;
  waitingMinutes: number;
  estimatedWaitMinutes: number | null;
  isPriority: boolean;
};

export type ManagerAppointmentsToday = {
  statusCounts: {
    confirmed: number;
    checkedIn: number;
    waiting: number;
    serving: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
  slotsByHour: { hourLabel: string; count: number }[];
  appointments: { time: string; serviceName: string; status: string; ticketNumber: string | null }[];
};

export type MyCounterDto = {
  counterNumber: number;
  branchName: string;
  serviceLaneName: string;
  mode: string;
  branchId: string;
  allowedServiceTypeIds: string[];
};

export type WaitingTicketDto = {
  ticketNumber: string;
  entryType: string;
  position: number;
  estimatedWaitMinutes: number | null;
};

export type ManagerCounterRowDto = {
  id: string;
  number: number;
  mode: string;
  assignedStaffEmail: string | null;
  allowedLanesDisplay: string;
  allowedServiceTypeIds: string[];
  currentDedicatedServiceTypeId?: string | null;
  currentDedicatedLaneName?: string | null;
};

export type BranchOperationalSettings = {
  onlineQuotaPercent: number;
  walkInQuotaPercent: number;
  slotDurationMinutes: number;
  serviceZoneOffsetMinutes: number;
  /** When true, alert if upcoming online bookings exceed configured slot capacity (monitoring only; does not auto-adjust). */
  adaptiveSlotCapacityEnabled: boolean;
  minSlotTotalCapacity: number | null;
  maxSlotTotalCapacity: number | null;
  /** Minutes before booking SlotStart that an unchecked online may enter the call pool (0 = at slot start only). */
  onlineEarlyCallMinutes: number;
  /** After Call next, if service is not started within this many minutes, mark absent / no-show. */
  calledAbsentGraceMinutes: number;
  weeklyOperatingHours: BranchOperatingHourRow[];
};

export type AssignableStaffDto = { id: string; email: string; name: string; role: string };

export type ManagerInsightAlert = { severity: string; message: string };

export type ManagerLaneAnalytics = {
  serviceTypeId: string;
  serviceName: string;
  waitingCount: number;
  activeCountersForLane: number;
  estimatedWaitMinutes: number | null;
  avgServiceMinutesObserved: number;
  completedToday: number;
  nextWindowOnlineCapacity: number | null;
  nextWindowWalkCapacity: number | null;
  nextWindowSlotStartIso: string | null;
};

export type ManagerSuggestion = {
  kind: string;
  title: string;
  detail: string;
  relatedServiceTypeId: string | null;
  relatedCounterNumber: number | null;
  relatedCounterId: string | null;
};

export type ManagerInsights = {
  alerts: ManagerInsightAlert[];
  suggestions: ManagerSuggestion[];
  lanes: ManagerLaneAnalytics[];
  noShowsToday: number;
};

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    return j.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LoginResponse>;
}

export async function apiBranches(): Promise<BranchDto[]> {
  const res = await fetch(`${API_BASE}/api/branches`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BranchDto[]>;
}

export async function apiMyCounter(): Promise<MyCounterDto> {
  const res = await fetch(`${API_BASE}/api/staff/my-counter`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MyCounterDto>;
}

export async function apiWaitingQueue(branchId: string, serviceTypeId: string): Promise<WaitingTicketDto[]> {
  const res = await fetch(
    `${API_BASE}/api/staff/branches/${branchId}/services/${serviceTypeId}/waiting`,
    { headers: await staffAuthHeaders() },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<WaitingTicketDto[]>;
}

export async function apiCallNext(branchId: string, serviceTypeId: string): Promise<CallNextResponse> {
  const res = await fetch(`${API_BASE}/api/staff/call-next`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ branchId, serviceTypeId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CallNextResponse>;
}

export async function apiStartService(ticketNumber: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/staff/start-service`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ ticketNumber }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiEndService(ticketNumber: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/staff/end-service`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ ticketNumber }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiMarkMissed(ticketNumber: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/staff/mark-missed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ ticketNumber }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiLiveDashboard(branchId: string): Promise<LiveDashboard> {
  const res = await fetch(`${API_BASE}/api/branches/${branchId}/dashboard/live`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LiveDashboard>;
}

export async function apiManagerCounters(branchId: string): Promise<ManagerCounterRowDto[]> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ManagerCounterRowDto[]>;
}

export async function apiManagerSetCounterMode(
  branchId: string,
  counterId: string,
  mode: "Active" | "Break" | "Closed",
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/mode`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerSetCounterStaff(
  branchId: string,
  counterId: string,
  staffId: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/staff`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ staffId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerSetAllowedServices(
  branchId: string,
  counterId: string,
  serviceTypeIds: string[],
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/allowed-services`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ serviceTypeIds }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerSetDedicatedLane(
  branchId: string,
  counterId: string,
  serviceTypeId: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/dedicated-lane`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify({ serviceTypeId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerOperationalSettings(branchId: string): Promise<BranchOperationalSettings> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/operational-settings`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BranchOperationalSettings>;
}

export async function apiManagerPatchOperationalSettings(
  branchId: string,
  body: {
    onlineQuotaPercent?: number;
    slotDurationMinutes?: number;
    weeklyOperatingHours?: BranchOperatingHourRow[];
    adaptiveSlotCapacityEnabled?: boolean;
    minSlotTotalCapacity?: number;
    maxSlotTotalCapacity?: number;
    clearMinSlotTotalCapacity?: boolean;
    clearMaxSlotTotalCapacity?: boolean;
    onlineEarlyCallMinutes?: number;
    calledAbsentGraceMinutes?: number;
  },
): Promise<BranchOperationalSettings> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/operational-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BranchOperationalSettings>;
}

export async function apiManagerInsights(branchId: string): Promise<ManagerInsights> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/insights`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ManagerInsights>;
}

export async function apiManagerAnalyticsToday(branchId: string): Promise<BranchAnalyticsToday> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/analytics/today`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BranchAnalyticsToday>;
}

export async function apiManagerAssignableStaff(branchId: string): Promise<AssignableStaffDto[]> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/assignable-staff`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<AssignableStaffDto[]>;
}
