import { API_BASE } from "./config";
import type { LoginResponse } from "./authTypes";
import {
  clearRefreshToken,
  clearToken,
  clearUserEmail,
  readRefreshToken,
  readToken,
  saveRefreshToken,
  saveToken,
} from "./authStorage";

const subscribers = new Set<(access: string | null) => void>();

/** Fired when access token changes or session is cleared (e.g. after refresh or failed refresh). */
export function subscribeCustomerAccessToken(cb: (access: string | null) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function emit(access: string | null) {
  for (const cb of subscribers) cb(access);
}

function base64UrlToBytes(segment: string): string {
  const pad = segment + "===".slice((segment.length + 3) % 4);
  const b64 = pad.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") return atob(b64);
  // Hermes / RN
  const g = globalThis as unknown as { atob?: (s: string) => string };
  if (g.atob) return g.atob(b64);
  throw new Error("atob unavailable");
}

function parseJwtExpMs(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const json = base64UrlToBytes(parts[1]);
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isAccessExpiredOrSoon(jwt: string, skewSec: number): boolean {
  const expMs = parseJwtExpMs(jwt);
  if (expMs == null) return true;
  return Date.now() >= expMs - skewSec * 1000;
}

async function clearLocalSession(): Promise<void> {
  await clearToken();
  await clearRefreshToken();
  await clearUserEmail();
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshWithStoredRefresh(refresh: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`refresh ${res.status}`);
  const body = (await res.json()) as LoginResponse;
  await saveToken(body.token);
  if (!body.refreshToken) throw new Error("unauthorized");
  await saveRefreshToken(body.refreshToken);
  emit(body.token.trim());
  return body.token.trim();
}

/**
 * Returns a usable access JWT, refreshing with the stored refresh token when the access token is
 * missing or near expiry. Returns null if the user is not signed in or refresh failed.
 */
export async function getValidCustomerAccessToken(): Promise<string | null> {
  const access = (await readToken())?.trim() ?? "";
  if (access && !isAccessExpiredOrSoon(access, 60)) return access;

  const refresh = (await readRefreshToken())?.trim() ?? "";
  if (!refresh) {
    if (access && isAccessExpiredOrSoon(access, 0)) {
      await clearLocalSession();
      emit(null);
    }
    return null;
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      return await refreshWithStoredRefresh(refresh);
    } catch (e) {
      if (e instanceof Error && e.message === "unauthorized") {
        await clearLocalSession();
        emit(null);
        return null;
      }
      const access = (await readToken())?.trim() ?? "";
      return access || null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Best-effort server-side revoke of the current refresh session. */
export async function revokeCustomerRefreshRemote(refreshToken: string): Promise<void> {
  const trimmed = refreshToken.trim();
  if (!trimmed) return;
  try {
    await fetch(`${API_BASE}/api/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: trimmed }),
    });
  } catch {
    /* offline */
  }
}
