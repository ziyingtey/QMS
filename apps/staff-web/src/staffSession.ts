import { API_BASE } from "./config";
import {
  clearStoredSession,
  getStoredRefreshToken,
  getStoredToken,
  setStoredRefreshToken,
  setStoredToken,
} from "./staffStorage";

const sessionListeners = new Set<() => void>();

export function subscribeStaffSession(cb: () => void): () => void {
  sessionListeners.add(cb);
  return () => sessionListeners.delete(cb);
}

function emitSession() {
  for (const cb of sessionListeners) cb();
}

function parseJwtExpMs(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const pad = parts[1] + "===".slice((parts[1].length + 3) % 4);
    const json = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
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

type RefreshBody = { token: string; refreshToken?: string; userId: string; email: string; role: string; branchId: string | null };

async function callRefresh(refresh: string): Promise<RefreshBody> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`refresh ${res.status}`);
  return res.json() as Promise<RefreshBody>;
}

let refreshInFlight: Promise<string | null> | null = null;

export async function getValidStaffAccessToken(): Promise<string | null> {
  const access = getStoredToken()?.trim() ?? "";
  if (access && !isAccessExpiredOrSoon(access, 60)) return access;

  const refresh = getStoredRefreshToken()?.trim() ?? "";
  if (!refresh) {
    if (access && isAccessExpiredOrSoon(access, 0)) {
      clearStoredSession();
      emitSession();
    }
    return null;
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const body = await callRefresh(refresh);
      setStoredToken(body.token);
      if (body.refreshToken) setStoredRefreshToken(body.refreshToken);
      emitSession();
      return body.token.trim();
    } catch (e) {
      if (e instanceof Error && e.message === "unauthorized") {
        clearStoredSession();
        emitSession();
        return null;
      }
      return getStoredToken()?.trim() || null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function revokeStaffRefreshRemote(refreshToken: string): Promise<void> {
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
