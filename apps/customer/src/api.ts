import { API_BASE } from "./config";
import type { LoginResponse, RegisterPendingResponse } from "./authTypes";
import { getValidCustomerAccessToken } from "./customerSession";

export type { LoginResponse, RegisterPendingResponse };

function bearerHeaders(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token.trim()}` };
}

async function customerAuthHeaders(): Promise<{ Authorization: string }> {
  const t = await getValidCustomerAccessToken();
  if (!t) throw new Error("Not signed in. Open Profile to log in.");
  return bearerHeaders(t);
}

/** Cold start: check whether a stored JWT is still accepted. Do not treat network/5xx as logout. */
export async function probeCustomerSession(token: string): Promise<"ok" | "unauthorized" | "unavailable"> {
  const trimmed = token.trim();
  if (!trimmed) return "unauthorized";
  try {
    const res = await fetch(`${API_BASE}/api/customers/me`, { headers: bearerHeaders(trimmed) });
    if (res.status === 401 || res.status === 403) return "unauthorized";
    if (res.ok) return "ok";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export type ServiceDto = {
  id: string;
  code: string;
  name: string;
  defaultAvgServiceMinutes: number;
};

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
  /** Street-level label from API (empty if older database). */
  address?: string;
  /** Malaysian state / territory for filters (empty if not set). */
  state?: string;
  latitude: number;
  longitude: number;
  onlineQuotaPercent: number;
  slotDurationMinutes: number;
  geofenceMeters: number;
  /** Minutes east of UTC for branch calendar / slot dates (e.g. 480 = UTC+8). */
  serviceZoneOffsetMinutes: number;
  operatingHours?: string | null;
  openingStatus?: string | null;
  imageUrl?: string | null;
  /** Mon–Sun rows when API returns them (drives real bookable days vs weekend closed). */
  weeklyOperatingHours?: BranchOperatingHourRow[];
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
  counterNumber?: number | null;
  servedAt?: string | null;
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

function messageForHttpStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "Incorrect email or password, or your session expired. Please sign in again.";
  }
  if (status === 404) return "We couldn’t find that. It may have been removed or the link is out of date.";
  if (status === 409) return "An account with this email already exists.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "The service is temporarily unavailable. Please try again in a few minutes.";
  if (status === 400) return "We couldn’t complete that. Check your details and try again.";
  return "Something went wrong. Check your internet connection and try again.";
}

/** User-facing text for failed API responses (no "HTTP 400" prefixes). */
async function parseError(res: Response): Promise<string> {
  const status = res.status;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return messageForHttpStatus(status);
  }

  const trimmed = text?.trim();
  if (!trimmed) {
    return messageForHttpStatus(status);
  }

  try {
    const j = JSON.parse(trimmed) as {
      message?: string;
      detail?: string;
      title?: string;
      errors?: Record<string, string[] | string>;
    };
    const title = typeof j.title === "string" ? j.title.trim() : "";
    const fromFields =
      (typeof j.detail === "string" && j.detail.trim()) ||
      (typeof j.message === "string" && j.message.trim()) ||
      (title && title !== "One or more validation errors occurred." ? title : "");
    if (fromFields) return fromFields;

    if (j.errors && typeof j.errors === "object") {
      const lines = Object.entries(j.errors).flatMap(([, v]) => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === "string") return [v];
        return [];
      });
      if (lines.length) return lines.join(" ");
    }
  } catch {
    /* not JSON — proxy HTML, etc. */
  }

  if (trimmed.startsWith("<") || trimmed.length > 400) {
    return messageForHttpStatus(status);
  }

  return trimmed;
}

/** Text for Alert dialogs when `fetch` or API helpers throw. */
export function userFacingApiError(e: unknown): string {
  if (e instanceof TypeError) {
    return "We couldn’t reach the server. If you’re on a phone or emulator, use your computer’s LAN IP in EXPO_PUBLIC_API_URL (Android emulator: http://10.0.2.2:5154).";
  }
  if (e instanceof Error) {
    const raw = e.message.trim();
    if (!raw) return "Something went wrong. Try again.";
    const stripped = raw.replace(/^HTTP\s+\d{3}[^\n]*\.\s*/i, "").trim();
    return stripped.length > 0 ? stripped : raw;
  }
  return "Something went wrong. Confirm the QMS API is running and EXPO_PUBLIC_API_URL matches it.";
}

export async function apiRegister(
  email: string,
  password: string,
  name?: string,
  phone?: string | null,
): Promise<LoginResponse | RegisterPendingResponse> {
  const p = phone?.trim();
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name,
      phone: p && p.length > 0 ? p : null,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>;
  if (json.requiresEmailVerification === true) {
    return {
      requiresEmailVerification: true,
      message: String(json.message ?? "Check your email."),
      emailSent: Boolean(json.emailSent),
      usedDryRun: Boolean(json.usedDryRun),
    };
  }
  return json as unknown as LoginResponse;
}

export async function apiResendVerificationEmail(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { message: string };
}

export async function apiVerifyEmailOtp(email: string, otp: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { message: string };
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
  const raw = (await res.json()) as unknown[];
  if (!Array.isArray(raw)) throw new Error("Unexpected branches response.");
  return raw.map((row) => {
    const o = row as Record<string, unknown>;
    const servicesRaw = o.services ?? o.Services;
    const services = Array.isArray(servicesRaw)
      ? (servicesRaw as Record<string, unknown>[]).map((s) => ({
          id: String(s.id ?? s.Id ?? ""),
          code: String(s.code ?? s.Code ?? ""),
          name: String(s.name ?? s.Name ?? ""),
          defaultAvgServiceMinutes: Number(s.defaultAvgServiceMinutes ?? s.DefaultAvgServiceMinutes ?? 0),
        }))
      : [];
    const weeklyRaw = o.weeklyOperatingHours ?? o.WeeklyOperatingHours;
    const weeklyOperatingHours = Array.isArray(weeklyRaw)
      ? (weeklyRaw as Record<string, unknown>[]).map((h) => ({
          dayOfWeek: String(h.dayOfWeek ?? h.DayOfWeek ?? ""),
          isClosed: Boolean(h.isClosed ?? h.IsClosed ?? false),
          openMinutesFromMidnight:
            h.openMinutesFromMidnight != null || h.OpenMinutesFromMidnight != null
              ? Number(h.openMinutesFromMidnight ?? h.OpenMinutesFromMidnight)
              : null,
          closeMinutesFromMidnight:
            h.closeMinutesFromMidnight != null || h.CloseMinutesFromMidnight != null
              ? Number(h.closeMinutesFromMidnight ?? h.CloseMinutesFromMidnight)
              : null,
        }))
      : undefined;
    return {
      id: String(o.id ?? o.Id ?? ""),
      branchCode: Number(o.branchCode ?? o.BranchCode ?? 0),
      name: String(o.name ?? o.Name ?? ""),
      address: o.address != null ? String(o.address) : o.Address != null ? String(o.Address) : undefined,
      state: o.state != null ? String(o.state) : o.State != null ? String(o.State) : undefined,
      latitude: Number(o.latitude ?? o.Latitude ?? 0),
      longitude: Number(o.longitude ?? o.Longitude ?? 0),
      onlineQuotaPercent: Number(o.onlineQuotaPercent ?? o.OnlineQuotaPercent ?? 0),
      slotDurationMinutes: Number(o.slotDurationMinutes ?? o.SlotDurationMinutes ?? 30),
      geofenceMeters: Number(o.geofenceMeters ?? o.GeofenceMeters ?? 0),
      serviceZoneOffsetMinutes: Number(o.serviceZoneOffsetMinutes ?? o.ServiceZoneOffsetMinutes ?? 480),
      operatingHours: o.operatingHours != null ? String(o.operatingHours) : o.OperatingHours != null ? String(o.OperatingHours) : undefined,
      openingStatus: o.openingStatus != null ? String(o.openingStatus) : o.OpeningStatus != null ? String(o.OpeningStatus) : "Open",
      imageUrl: o.imageUrl != null ? String(o.imageUrl) : o.ImageUrl != null ? String(o.ImageUrl) : undefined,
      weeklyOperatingHours,
      services,
    } satisfies BranchDto;
  });
}

export type CustomerProfile = {
  email: string;
  name: string;
  phone: string | null;
  /** Branch ids the customer saved as favorites (any number). */
  favoriteBranchIds: string[];
};

function parseGuidIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter((s) => s.length > 0);
}

function parseCustomerProfile(o: Record<string, unknown>): CustomerProfile {
  return {
    email: String(o.email ?? o.Email ?? ""),
    name: String(o.name ?? o.Name ?? ""),
    phone: o.phone != null ? String(o.phone) : o.Phone != null ? String(o.Phone) : null,
    favoriteBranchIds: parseGuidIdList(o.favoriteBranchIds ?? o.FavoriteBranchIds),
  };
}

export async function apiCustomerMe(): Promise<CustomerProfile> {
  const res = await fetch(`${API_BASE}/api/customers/me`, { headers: await customerAuthHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  const o = (await res.json()) as Record<string, unknown>;
  return parseCustomerProfile(o);
}

export async function apiUpdateProfile(data: { name?: string; phone?: string }): Promise<CustomerProfile> {
  const res = await fetch(`${API_BASE}/api/customers/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await customerAuthHeaders()) },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const o = (await res.json()) as Record<string, unknown>;
  return parseCustomerProfile(o);
}

export async function apiToggleFavoriteBranch(branchId: string): Promise<CustomerProfile> {
  const res = await fetch(`${API_BASE}/api/customers/me/favorite-branches/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await customerAuthHeaders()) },
    body: JSON.stringify({ branchId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const o = (await res.json()) as Record<string, unknown>;
  return parseCustomerProfile(o);
}

/** `dayYmd` = branch-local calendar date, e.g. 2026-05-05 (not UTC midnight ISO). */
export async function apiSlots(branchId: string, serviceId: string, dayYmd: string): Promise<SlotDto[]> {
  const q = encodeURIComponent(dayYmd);
  const res = await fetch(
    `${API_BASE}/api/branches/${branchId}/services/${serviceId}/slots?day=${q}`,
    { headers: await customerAuthHeaders() },
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

export async function apiCreateBooking(body: {
  branchId: string;
  serviceTypeId: string;
  slotStart: string;
  slotEnd: string;
}): Promise<BookingCreated> {
  const res = await fetch(`${API_BASE}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await customerAuthHeaders()) },
    body: JSON.stringify({
      branchId: body.branchId,
      serviceTypeId: body.serviceTypeId,
      slotStart: body.slotStart,
      slotEnd: body.slotEnd,
    }),
  });
  if (!res.ok) {
    const msg = await parseError(res);
    throw new Error(msg);
  }
  return res.json() as Promise<BookingCreated>;
}

export async function apiCheckIn(
  bookingId: string,
  coords?: { latitude: number; longitude: number },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/check-in`, {
    method: "POST",
    headers: {
      ...(await customerAuthHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiRescheduleBooking(bookingId: string, slotStart: string, slotEnd: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/reschedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await customerAuthHeaders()) },
    body: JSON.stringify({ slotStart, slotEnd }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiCancelBooking(bookingId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/cancel`, {
    method: "POST",
    headers: await customerAuthHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiMyBookings(): Promise<BookingSummary[]> {
  const res = await fetch(`${API_BASE}/api/bookings/mine`, {
    headers: await customerAuthHeaders(),
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
