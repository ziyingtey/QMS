import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BranchDto } from "../api";
import {
  ApiError,
  apiMyWalkIns,
  apiPublicBranch,
  apiPublicWalkIn,
  apiQueueStatus,
  type QueueStatus,
} from "../walkInApi";
import "../styles/walk-in.css";

/** Public page opened from the branch QR: /walk-in?branch={branchId}&t={dailyToken}. No login. */

type StoredTicket = { ticketNumber: string; serviceName: string; day: string };
const SCAN_MSG = "Please scan the QR code at the branch";
const POLL_MS = 15000;

const storeKey = (branchId: string) => `qms_walkin_tickets_${branchId}`;
const today = () => new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD

function readStored(branchId: string): StoredTicket[] {
  try {
    const list = JSON.parse(localStorage.getItem(storeKey(branchId)) ?? "[]") as StoredTicket[];
    return Array.isArray(list) ? list.filter((x) => x.day === today()) : [];
  } catch {
    return [];
  }
}
function writeStored(branchId: string, list: StoredTicket[]) {
  localStorage.setItem(storeKey(branchId), JSON.stringify(list.slice(0, 20)));
}

export function WalkInPublicPage() {
  const [params] = useSearchParams();
  const branchId = params.get("branch") ?? params.get("branchId") ?? "";
  const token = params.get("t") ?? "";

  const [branch, setBranch] = useState<BranchDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<StoredTicket[]>(() => (branchId ? readStored(branchId) : []));
  const [active, setActive] = useState<string | null>(() => (branchId ? (readStored(branchId)[0]?.ticketNumber ?? null) : null));
  const [picking, setPicking] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<QueueStatus | null>(null);

  const saveTickets = useCallback(
    (list: StoredTicket[]) => {
      setTickets(list);
      if (branchId) writeStored(branchId, list);
    },
    [branchId],
  );

  // Load branch + restore tickets taken on this device today (server is source of truth).
  useEffect(() => {
    if (!branchId) return;
    apiPublicBranch(branchId)
      .then(setBranch)
      .catch(() => setLoadError("Branch not found. " + SCAN_MSG + "."));
    apiMyWalkIns(branchId)
      .then((mine) => {
        if (mine.length === 0) return;
        const merged: StoredTicket[] = mine.map((m) => ({ ticketNumber: m.ticketNumber, serviceName: m.serviceName, day: today() }));
        saveTickets(merged);
        const open = mine.find((m) => m.state === "Waiting" || m.state === "Called" || m.state === "Serving");
        setActive((cur) => cur ?? (open ?? mine[0]).ticketNumber);
      })
      .catch(() => {
        /* offline → keep local copy */
      });
  }, [branchId, saveTickets]);

  const refreshStatus = useCallback(async () => {
    if (!branchId || !active) return;
    try {
      setStatus(await apiQueueStatus(branchId, active));
    } catch {
      /* keep last status */
    }
  }, [branchId, active]);

  useEffect(() => {
    if (!active) return;
    const first = window.setTimeout(() => void refreshStatus(), 0);
    const id = window.setInterval(() => void refreshStatus(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void refreshStatus();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active, refreshStatus]);

  const services = useMemo(() => branch?.services ?? [], [branch]);
  const showPicker = picking || (!active && tickets.length === 0);

  const take = async () => {
    if (!serviceId || !branchId) return;
    if (!token) {
      setError(SCAN_MSG + ".");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiPublicWalkIn(branchId, serviceId, token);
      const svc = services.find((s) => s.id === serviceId)?.name ?? "";
      saveTickets([{ ticketNumber: r.ticketNumber, serviceName: svc, day: today() }, ...tickets.filter((t) => t.ticketNumber !== r.ticketNumber)]);
      setStatus(null);
      setActive(r.ticketNumber);
      setPicking(false);
      setServiceId("");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 403)) setError(SCAN_MSG + " (this link has expired).");
      else if (e instanceof ApiError && e.status === 429) setError(e.message);
      else setError(e instanceof Error ? e.message : "Could not take a ticket. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!branchId) {
    return (
      <div className="wi-page">
        <div className="wi-wrap">
          <div className="wi-card wi-error">{SCAN_MSG}.</div>
        </div>
      </div>
    );
  }

  const activeMeta = tickets.find((t) => t.ticketNumber === active);
  const state = status?.state ?? "Waiting";
  const done = state === "Completed" || state === "Missed";

  return (
    <div className="wi-page">
      <div className="wi-wrap">
        <div className="wi-brand">
          <h1>QGo Walk-in</h1>
          <small>{branch?.name ?? ""}</small>
        </div>

        {loadError ? <div className="wi-error">{loadError}</div> : null}

        {!showPicker && active ? (
          <div className="wi-card wi-ticket">
            <div className="wi-ticket__label">Your ticket</div>
            <div className="wi-ticket__number">{active}</div>
            <div className="wi-ticket__svc">{status?.serviceName ?? activeMeta?.serviceName ?? ""}</div>
            {state === "Called" || state === "Serving" ? (
              <div className="wi-called">
                {state === "Called" ? "It's your turn! " : "Now serving. "}
                {status?.counterNumber ? `Please go to Counter ${status.counterNumber}.` : ""}
              </div>
            ) : done ? (
              <p className="wi-muted">This ticket is {state.toLowerCase()}.</p>
            ) : (
              <div className="wi-stats">
                <div className="wi-stat">
                  <b>{status ? status.peopleAhead : "—"}</b>
                  <span>People ahead</span>
                </div>
                <div className="wi-stat">
                  <b>{status?.estimatedWaitMinutes != null ? `~${Math.round(status.estimatedWaitMinutes)} min` : "—"}</b>
                  <span>Estimated wait</span>
                </div>
              </div>
            )}
            {status?.currentServingTicketNumber ? <p className="wi-muted">Now serving: {status.currentServingTicketNumber}</p> : null}
            <p className="wi-muted">Updates automatically. Keep this page open or come back to it anytime today.</p>
          </div>
        ) : null}

        {!showPicker && tickets.length > 1 ? (
          <div className="wi-card">
            <h2>Your tickets today</h2>
            <ul className="wi-list">
              {tickets.map((t) => (
                <li key={t.ticketNumber}>
                  <button className="wi-chip" aria-pressed={t.ticketNumber === active} onClick={() => { setStatus(null); setActive(t.ticketNumber); }}>
                    {t.ticketNumber}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showPicker ? (
          <div className="wi-card">
            <h2>Choose a service</h2>
            {!token ? <div className="wi-error">{SCAN_MSG}.</div> : null}
            <div className="wi-services">
              {services.map((s) => (
                <button key={s.id} className="wi-service" aria-pressed={serviceId === s.id} onClick={() => setServiceId(s.id)}>
                  {s.name}
                  <small>~{s.defaultAvgServiceMinutes} min per customer</small>
                </button>
              ))}
              {branch && services.length === 0 ? <p className="wi-muted">No services available right now.</p> : null}
            </div>
            {error ? <div className="wi-error" style={{ marginTop: 12 }}>{error}</div> : null}
            <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
              <button className="wi-btn" disabled={!serviceId || busy || !token} onClick={() => void take()}>
                {busy ? "Taking ticket…" : "Get ticket"}
              </button>
              {tickets.length > 0 ? (
                <button className="wi-btn wi-btn--ghost" onClick={() => setPicking(false)}>
                  Back to my ticket
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <button className="wi-btn wi-btn--ghost" onClick={() => { setError(null); setPicking(true); }}>
            Take another ticket
          </button>
        )}
      </div>
    </div>
  );
}
