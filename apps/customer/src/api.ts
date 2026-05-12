import { API_BASE } from "./config";

function bearerHeaders(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token.trim()}` };
}

export type LoginResponse = {
  token: string;
  userId: string;
  email: string;
  role: string;
};

export type ServiceDto = {
  id: string;
  code: string;
  name: string;
  defaultAvgServiceMinutes: number;
};

export type BranchDto = {
  id: string;
  branchCode: number;
  name: string;
  /** Street-level label from API (empty if older database). */
  address?: string;
  /** Malaysian state / territory for filters (empty if not set). */
  state?: string;
  latitude: number;
  longitude: number;
  onlineQuotaPercent: number;
  slotDurationMinutes: number;
  geofenceMeters: number;
  serviceDayStartMinutes: number;
  serviceDayEndMinutes: number;
  /** Minutes east of UTC for branch calendar / slot dates (e.g. 480 = UTC+8). */
  serviceZoneOffsetMinutes: number;
  services: ServiceDto[];
};

export type SlotDto = {
  slotStart: string;
  slotEnd: string;
  onlineUsed: number;
  onlineCapacity: number;
  walkInUsed: number;
  walkInCapacity: number;
  status: string;
};

export type BookingCreated = {
  bookingId: string;
  ticketNumber: string;
  slotStart: string;
  slotEnd: string;
  serviceName: string;
};

export type QueueStatus = {
  ticketNumber: string;
  state: string;
  peopleAhead: number;
  estimatedWaitMinutes: number | null;
  serviceName: string;
  currentServingTicketNumber?: string | null;
  nextEstimatedMessage?: string | null;
};

export type BookingSummary = {
  id: string;
  branchId: string;
  serviceTypeId: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  ticketNumber: string | null;
};

async function parseError(res: Response): Promise<string> {
  const statusLine = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return `${statusLine}. (Could not read response body.)`;
  }
  if (!text?.trim()) {
    if (res.status === 401) {
      return `${statusLine}. Login session rejected (empty body is normal for JWT). Open Profile → sign out → sign in again. If you changed Jwt:Key or switched API machines, old tokens stop working.`;
    }
    return `${statusLine}. Empty response — wrong route or proxy; confirm EXPO_PUBLIC_API_URL matches a running QMS API.`;
  }

  try {
    const j = JSON.parse(text) as {
      message?: string;
      detail?: string;
      title?: string;
      errors?: Record<string, string[]>;
    };
    const fromFields =
      (typeof j.detail === "string" && j.detail.trim()) ||
      (typeof j.message === "string" && j.message.trim()) ||
      (typeof j.title === "string" && j.title.trim());
    if (fromFields) return `${statusLine}. ${fromFields}`;
    if (j.errors) {
      const lines = Object.entries(j.errors).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
      if (lines.length) return `${statusLine}. ${lines.join("\n")}`;
    }
  } catch {
    /* not JSON — often HTML from a proxy or wrong host */
  }
  const snippet = text.length > 300 ? `${text.slice(0, 300)}…` : text;
  return `${statusLine}. ${snippet}`;
}

/** Text for Alert dialogs when `fetch` or API helpers throw. */
export function userFacingApiError(e: unknown): string {
  if (e instanceof TypeError) {
    return `${e.message}\n\nTip: a phone or emulator often cannot use 127.0.0.1 for the API. Use your computer’s LAN IP in EXPO_PUBLIC_API_URL, or http://10.0.2.2:5154 on Android emulator.`;
  }
  if (e instanceof Error && e.message.trim()) return e.message;
  return "Unknown error. Confirm the QMS API is running and EXPO_PUBLIC_API_URL matches it.";
}

export async function apiRegister(email: string, password: string, name?: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LoginResponse>;
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

/** `dayYmd` = branch-local calendar date, e.g. 2026-05-05 (not UTC midnight ISO). */
export async function apiSlots(branchId: string, serviceId: string, dayYmd: string, token: string): Promise<SlotDto[]> {
  const q = encodeURIComponent(dayYmd);
  const res = await fetch(
    `${API_BASE}/api/branches/${branchId}/services/${serviceId}/slots?day=${q}`,
    { headers: bearerHeaders(token) },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const text = await res.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `HTTP ${res.status}. Expected JSON slot list but got non-JSON (check EXPO_PUBLIC_API_URL). Snippet: ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}`,
    );
  }
  if (!Array.isArray(raw)) throw new Error("Unexpected slots response (not an array). Is the API up to date?");
  return raw.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      slotStart: String(o.slotStart ?? o.SlotStart ?? ""),
      slotEnd: String(o.slotEnd ?? o.SlotEnd ?? ""),
      onlineUsed: Number(o.onlineUsed ?? o.OnlineUsed ?? 0),
      onlineCapacity: Number(o.onlineCapacity ?? o.OnlineCapacity ?? 0),
      walkInUsed: Number(o.walkInUsed ?? o.WalkInUsed ?? 0),
      walkInCapacity: Number(o.walkInCapacity ?? o.WalkInCapacity ?? 0),
      status: String(o.status ?? o.Status ?? ""),
    };
  });
}

export async function apiCreateBooking(
  token: string,
  body: { branchId: string; serviceTypeId: string; slotStart: string; slotEnd: string },
): Promise<BookingCreated> {
  const res = await fetch(`${API_BASE}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearerHeaders(token) },
    body: JSON.stringify({
      branchId: body.branchId,
      serviceTypeId: body.serviceTypeId,
      slotStart: body.slotStart,
      slotEnd: body.slotEnd,
    }),
  });
  if (!res.ok) {
    const msg = await parseError(res);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<BookingCreated>;
}

export async function apiCheckIn(
  token: string,
  bookingId: string,
  coords?: { latitude: number; longitude: number },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/check-in`, {
    method: "POST",
    headers: {
      ...bearerHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiRescheduleBooking(
  token: string,
  bookingId: string,
  slotStart: string,
  slotEnd: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/reschedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...bearerHeaders(token) },
    body: JSON.stringify({ slotStart, slotEnd }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiCancelBooking(token: string, bookingId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/cancel`, {
    method: "POST",
    headers: bearerHeaders(token),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiMyBookings(token: string): Promise<BookingSummary[]> {
  const res = await fetch(`${API_BASE}/api/bookings/mine`, {
    headers: bearerHeaders(token),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<BookingSummary[]>;
}

export type ServiceLaneSummary = {
  serviceTypeId: string;
  serviceName: string;
  waitingCount: number;
  estimatedWaitMinutes: number | null;
  crowdLevel: string;
};

export async function apiServiceLaneSummary(branchId: string, serviceTypeId: string): Promise<ServiceLaneSummary> {
  const res = await fetch(
    `${API_BASE}/api/branches/${branchId}/services/${serviceTypeId}/summary`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ServiceLaneSummary>;
}

export async function apiWalkInLink(branchId: string, serviceTypeId: string): Promise<{ qrUrl: string; walkInApiHint: string }> {
  const res = await fetch(
    `${API_BASE}/api/branches/${branchId}/walk-in-link?serviceTypeId=${encodeURIComponent(serviceTypeId)}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ qrUrl: string; walkInApiHint: string }>;
}

export async function apiQueueStatus(branchId: string, ticket: string): Promise<QueueStatus> {
  const res = await fetch(
    `${API_BASE}/api/queue/status?branchId=${encodeURIComponent(branchId)}&ticket=${encodeURIComponent(ticket)}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<QueueStatus>;
}

export type WalkInResult = {
  ticketNumber: string;
  walkInCapacitySlotStart: string;
  walkInCapacitySlotEnd: string;
};

export async function apiWalkIn(branchId: string, serviceTypeId: string): Promise<WalkInResult> {
  const res = await fetch(`${API_BASE}/api/queue/walk-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branchId, serviceTypeId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<WalkInResult>;
}
