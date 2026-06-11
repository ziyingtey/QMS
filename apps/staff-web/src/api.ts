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
  services: ServiceDto[];
  weeklyOperatingHours?: BranchOperatingHourRow[];
};

export type CallNextResponse = { ticketNumber: string | null; counterNumber: number | null; message: string | null };

export type LiveDashboard = {
  customersInBranch: number;
  queueLength: number;
  avgWaitMinutes: number;
  activeCounters: number;
  customersServedToday: number;
  priorityWaiting: number;
  byService: { serviceTypeId: string; queueLength: number; estimatedWaitMinutes: number | null }[];
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

export async function apiManagerAssignableStaff(branchId: string): Promise<AssignableStaffDto[]> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/assignable-staff`, {
    headers: await staffAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<AssignableStaffDto[]>;
}
