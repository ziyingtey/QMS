import { API_BASE } from "./config";

export type LoginResponse = { token: string; userId: string; email: string; role: string };

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

const TOKEN_KEY = "qms_staff_token";
const ROLE_KEY = "qms_staff_role";
const EMAIL_KEY = "qms_staff_email";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getStoredRole(): string | null {
  return sessionStorage.getItem(ROLE_KEY);
}

export function setStoredRole(role: string): void {
  sessionStorage.setItem(ROLE_KEY, role);
}

export function setStoredEmail(email: string): void {
  sessionStorage.setItem(EMAIL_KEY, email);
}

export function getStoredEmail(): string | null {
  return sessionStorage.getItem(EMAIL_KEY);
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ROLE_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
}

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

export async function apiMyCounter(token: string): Promise<MyCounterDto> {
  const res = await fetch(`${API_BASE}/api/staff/my-counter`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MyCounterDto>;
}

export async function apiWaitingQueue(token: string, branchId: string, serviceTypeId: string): Promise<WaitingTicketDto[]> {
  const res = await fetch(
    `${API_BASE}/api/staff/branches/${branchId}/services/${serviceTypeId}/waiting`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<WaitingTicketDto[]>;
}

export async function apiCallNext(token: string, branchId: string, serviceTypeId: string): Promise<CallNextResponse> {
  const res = await fetch(`${API_BASE}/api/staff/call-next`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ branchId, serviceTypeId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CallNextResponse>;
}

export async function apiStartService(token: string, ticketNumber: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/staff/start-service`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ticketNumber }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiEndService(token: string, ticketNumber: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/staff/end-service`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ticketNumber }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiLiveDashboard(token: string, branchId: string): Promise<LiveDashboard> {
  const res = await fetch(`${API_BASE}/api/branches/${branchId}/dashboard/live`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LiveDashboard>;
}

export async function apiManagerCounters(token: string, branchId: string): Promise<ManagerCounterRowDto[]> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ManagerCounterRowDto[]>;
}

export async function apiManagerSetCounterMode(
  token: string,
  branchId: string,
  counterId: string,
  mode: "Active" | "Break" | "Closed",
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/mode`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerSetCounterStaff(
  token: string,
  branchId: string,
  counterId: string,
  staffId: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/staff`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ staffId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerSetAllowedServices(
  token: string,
  branchId: string,
  counterId: string,
  serviceTypeIds: string[],
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/allowed-services`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ serviceTypeIds }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerSetDedicatedLane(
  token: string,
  branchId: string,
  counterId: string,
  serviceTypeId: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/counters/${counterId}/dedicated-lane`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ serviceTypeId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiManagerOperationalSettings(
  token: string,
  branchId: string,
): Promise<BranchOperationalSettings> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/operational-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BranchOperationalSettings>;
}

export async function apiManagerPatchOperationalSettings(
  token: string,
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BranchOperationalSettings>;
}

export async function apiManagerInsights(token: string, branchId: string): Promise<ManagerInsights> {
  const res = await fetch(`${API_BASE}/api/manager/branches/${branchId}/insights`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ManagerInsights>;
}

export async function apiManagerAssignableStaff(token: string): Promise<AssignableStaffDto[]> {
  const res = await fetch(`${API_BASE}/api/manager/assignable-staff`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<AssignableStaffDto[]>;
}
