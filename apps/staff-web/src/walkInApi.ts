/** Walk-in via branch QR (public page) + staff issue + QR link. Kept separate from api.ts for easy revert. */
import { API_BASE } from "./config";
import { getValidStaffAccessToken, type BranchDto } from "./api";

export type WalkInResult = { ticketNumber: string; walkInCapacitySlotStart: string; walkInCapacitySlotEnd: string };
export type MyWalkInTicket = { ticketNumber: string; serviceTypeId: string; serviceName: string; state: string; createdAt: string };
export type QueueStatus = {
  ticketNumber: string;
  state: string;
  peopleAhead: number;
  estimatedWaitMinutes: number | null;
  serviceName: string;
  currentServingTicketNumber: string | null;
  nextEstimatedMessage: string | null;
  counterNumber: number | null;
  wasCalled?: boolean;
};
export type WalkInLink = { branchId: string; qrUrl: string; token: string; branchLocalDate: string; validUntil: string };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fail(res: Response): Promise<never> {
  let msg = res.statusText || `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { message?: string; detail?: string };
    msg = j.message ?? j.detail ?? msg;
  } catch {
    /* ignore */
  }
  throw new ApiError(res.status, msg);
}

const DEVICE_KEY = "qms_walkin_device_id";

/** Anonymous random id stored only in this browser (not personal data). */
export function getWalkInDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          });
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function apiPublicBranch(branchId: string): Promise<BranchDto> {
  const res = await fetch(`${API_BASE}/api/branches/${encodeURIComponent(branchId)}`);
  if (!res.ok) await fail(res);
  return res.json() as Promise<BranchDto>;
}

export async function apiPublicWalkIn(branchId: string, serviceTypeId: string, t: string): Promise<WalkInResult> {
  const res = await fetch(`${API_BASE}/api/queue/walk-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getWalkInDeviceId() },
    body: JSON.stringify({ branchId, serviceTypeId, t }),
  });
  if (!res.ok) await fail(res);
  return res.json() as Promise<WalkInResult>;
}

export async function apiMyWalkIns(branchId: string): Promise<MyWalkInTicket[]> {
  const res = await fetch(`${API_BASE}/api/queue/walk-in/mine?branchId=${encodeURIComponent(branchId)}`, {
    headers: { "X-Device-Id": getWalkInDeviceId() },
  });
  if (!res.ok) await fail(res);
  return res.json() as Promise<MyWalkInTicket[]>;
}

export async function apiQueueStatus(branchId: string, ticket: string): Promise<QueueStatus | null> {
  const res = await fetch(
    `${API_BASE}/api/queue/status?branchId=${encodeURIComponent(branchId)}&ticket=${encodeURIComponent(ticket)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) await fail(res);
  return res.json() as Promise<QueueStatus>;
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await getValidStaffAccessToken();
  if (!t) throw new ApiError(401, "Not signed in.");
  return { Authorization: `Bearer ${t}` };
}

export async function apiStaffWalkIn(branchId: string, serviceTypeId: string): Promise<WalkInResult> {
  const res = await fetch(`${API_BASE}/api/queue/walk-in/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ branchId, serviceTypeId }),
  });
  if (!res.ok) await fail(res);
  return res.json() as Promise<WalkInResult>;
}

export async function apiWalkInLink(branchId: string): Promise<WalkInLink> {
  const res = await fetch(`${API_BASE}/api/branches/${encodeURIComponent(branchId)}/walk-in-link`, {
    headers: await authHeaders(),
  });
  if (!res.ok) await fail(res);
  return res.json() as Promise<WalkInLink>;
}
