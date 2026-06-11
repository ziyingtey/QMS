import * as signalR from "@microsoft/signalr";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiBranches,
  apiCallNext,
  apiEndService,
  apiMarkMissed,
  apiLiveDashboard,
  apiMyCounter,
  apiStartService,
  apiWaitingQueue,
  clearStoredSession,
  getStoredEmail,
  getStoredRole,
  getStoredToken,
  getValidStaffAccessToken,
  subscribeStaffSession,
  type BranchDto,
  type LiveDashboard,
  type MyCounterDto,
  type WaitingTicketDto,
} from "../api";
import { API_BASE } from "../config";

export function StaffDeckPage() {
  const navigate = useNavigate();
  const [hubToken, setHubToken] = useState<string | null>(() => getStoredToken());
  const role = useMemo(() => getStoredRole(), []);
  const email = useMemo(() => getStoredEmail(), []);

  useEffect(() => {
    return subscribeStaffSession(() => {
      setHubToken(getStoredToken());
    });
  }, []);

  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [ticket, setTicket] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [live, setLive] = useState<LiveDashboard | null>(null);
  const [myCounter, setMyCounter] = useState<MyCounterDto | null>(null);
  const [waiting, setWaiting] = useState<WaitingTicketDto[]>([]);
  const [busy, setBusy] = useState(false);
  /** True after Start service succeeds (including auto-start right after Call next). Complete is blocked until this is set. */
  const [servingActive, setServingActive] = useState(false);

  const push = useCallback((line: string) => {
    setLog((prev) => [new Date().toLocaleTimeString() + " " + line, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    void (async () => {
      const t = await getValidStaffAccessToken();
      if (!t) {
        navigate("/login");
        return;
      }
      setHubToken(t);
      try {
        const b = await apiBranches();
        setBranches(b);
        try {
          const mc = await apiMyCounter();
          setMyCounter(mc);
          setBranchId(mc.branchId);
          const br = b.find((x) => x.id === mc.branchId);
          const list = br?.services ?? [];
          const filtered =
            !mc.allowedServiceTypeIds || mc.allowedServiceTypeIds.length === 0
              ? []
              : list.filter((s) => mc.allowedServiceTypeIds.includes(s.id));
          const pick = filtered[0] ?? undefined;
          if (pick) setServiceId(pick.id);
          else setServiceId("");
        } catch {
          if (b.length > 0) {
            setBranchId(b[0].id);
            if (b[0].services[0]) setServiceId(b[0].services[0].id);
          }
        }
      } catch (e) {
        push(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [navigate, push]);

  const refreshWaiting = useCallback(async () => {
    if (!branchId || !serviceId) return;
    try {
      const w = await apiWaitingQueue(branchId, serviceId);
      setWaiting(w);
    } catch {
      setWaiting([]);
    }
  }, [branchId, serviceId]);

  const refreshLive = useCallback(async () => {
    if (!branchId) return;
    try {
      const d = await apiLiveDashboard(branchId);
      setLive(d);
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    }
  }, [branchId, push]);

  useEffect(() => {
    if (!hubToken || !branchId) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue?access_token=${encodeURIComponent(hubToken)}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();

    conn.on("QueueUpdated", () => {
      push("QueueUpdated");
      void refreshWaiting();
      void refreshLive();
    });
    conn.on("TicketCalled", (ticket: string) => {
      push(`TicketCalled ${ticket}`);
      void refreshWaiting();
      void refreshLive();
    });
    conn.on("CountersUpdated", () => {
      push("CountersUpdated");
      void refreshLive();
      void (async () => {
        try {
          const mc = await apiMyCounter();
          setMyCounter(mc);
        } catch {
          /* ignore */
        }
      })();
    });

    void conn
      .start()
      .then(() => conn.invoke("WatchBranch", branchId))
      .catch((e) => {
        const msg = String(e);
        push(`SignalR: ${msg}`);
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
          push("Hint: is the API running? Set VITE_API_URL in staff-web to match (e.g. http://127.0.0.1:5154).");
      });

    conn.onreconnected(() => {
      void conn.invoke("WatchBranch", branchId).catch(() => {});
      void refreshWaiting();
      void refreshLive();
    });

    return () => {
      void conn.stop();
    };
  }, [hubToken, branchId, push, refreshWaiting, refreshLive]);

  useEffect(() => {
    void refreshLive();
    void refreshWaiting();
    const id = setInterval(() => {
      void refreshLive();
      void refreshWaiting();
    }, 8000);
    return () => clearInterval(id);
  }, [refreshLive, refreshWaiting]);

  const branch = branches.find((b) => b.id === branchId);

  const selectableServices = useMemo(() => {
    const list = branch?.services ?? [];
    if (!myCounter) return list;
    if (!myCounter.allowedServiceTypeIds || myCounter.allowedServiceTypeIds.length === 0) return [];
    const filtered = list.filter((s) => myCounter.allowedServiceTypeIds.includes(s.id));
    return filtered.length > 0 ? filtered : [];
  }, [branch?.services, myCounter]);

  useEffect(() => {
    if (!branch || !myCounter) return;
    setServiceId((prev) => {
      const ok = selectableServices.some((s) => s.id === prev);
      if (ok) return prev;
      return selectableServices[0]?.id ?? "";
    });
  }, [branch, myCounter, selectableServices]);

  const onLogout = () => {
    clearStoredSession();
    navigate("/login");
  };

  const onCallNext = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!branchId || !serviceId) return;
    if (!myCounter?.allowedServiceTypeIds?.length) return;
    setBusy(true);
    try {
      const r = await apiCallNext(branchId, serviceId);
      if (r.ticketNumber) {
        setTicket(r.ticketNumber);
        setServingActive(false);
        try {
          await apiStartService(r.ticketNumber);
          setServingActive(true);
          push(`Next: ${r.ticketNumber} — service started`);
        } catch (startErr) {
          push(startErr instanceof Error ? startErr.message : String(startErr));
          push("Press Start service when the customer is at the counter.");
        }
      } else {
        push(r.message ?? "No ticket");
      }
      await refreshWaiting();
      await refreshLive();
    } catch (err) {
      push(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onStart = async () => {
    if (!ticket) return;
    setBusy(true);
    try {
      await apiStartService(ticket);
      setServingActive(true);
      push(`Start ${ticket}`);
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onNoShow = async () => {
    if (!ticket) return;
    setBusy(true);
    try {
      await apiMarkMissed(ticket);
      push(`No show: ${ticket}`);
      setTicket("");
      setServingActive(false);
      await refreshWaiting();
      await refreshLive();
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (!ticket || !servingActive) return;
    setBusy(true);
    try {
      await apiEndService(ticket);
      push(`Complete ${ticket}`);
      setTicket("");
      setServingActive(false);
      await refreshWaiting();
      await refreshLive();
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const displayName = email?.split("@")[0] ?? "Staff";
  const staffIdDisplay = email?.replace(/@.+/, "") ?? "—";
  const laneBadge =
    myCounter?.serviceLaneName?.split(",")[0]?.trim() ||
    branch?.services.find((s) => s.id === serviceId)?.name ||
    "Service";
  const showLanePicker = selectableServices.length > 1;
  const lanesConfigured = (myCounter?.allowedServiceTypeIds?.length ?? 0) > 0;
  const canCallNext = Boolean(lanesConfigured && serviceId);
  const serviceNameForTicket = branch?.services.find((s) => s.id === serviceId)?.name ?? laneBadge;

  return (
    <div className="deck-page deck-page--staff">
      <header className="deck-topbar deck-topbar--bank">
        <div className="brand-inline brand-inline--bank">
          <span className="brand-mark brand-mark--pbb" title="Demo brand mark" />
          <span className="brand-text brand-text--bank">IH-QMS</span>
        </div>
        <div className="topbar-actions topbar-actions--spread">
          <span className="live-pill" title="Live queue updates">
            <span className="live-dot" /> Live
          </span>
          <div className="dash-user-block">
            <span className="dash-staff-id">{staffIdDisplay}</span>
            <span className="dash-avatar" aria-hidden title={email ?? ""}>
              {(displayName[0] ?? "?").toUpperCase()}
            </span>
          </div>
          {role === "Manager" ? (
            <Link to="/manager" className="link-muted" title="Assign tellers, lanes, and counter modes">
              Manager console
            </Link>
          ) : null}
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
            Log out
          </button>
        </div>
      </header>

      <div className="dash-identity-card">
        <div className="dash-identity-main">
          <h1 className="dash-counter-title">Counter {myCounter?.counterNumber ?? "—"}</h1>
          <p className="dash-counter-name">{displayName}</p>
        </div>
        <span className="dash-branch-badge">{myCounter?.branchName ?? branch?.name ?? "Branch"}</span>
      </div>

      <div className="deck-kpi-row">
        <div className="kpi-card">
          <div className="kpi-icon kpi-green" />
          <div>
            <div className="kpi-label">Customer served</div>
            <div className="kpi-value">{live?.customersServedToday ?? "—"}</div>
            <div className="kpi-foot">Today</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon kpi-blue" />
          <div>
            <div className="kpi-label">In queue</div>
            <div className="kpi-value">{live?.queueLength ?? "—"}</div>
            <div className="kpi-foot">Waiting customers</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon kpi-amber" />
          <div>
            <div className="kpi-label">Avg wait time</div>
            <div className="kpi-value">{live?.avgWaitMinutes ?? "—"}</div>
            <div className="kpi-foot">Minutes</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon kpi-gold" />
          <div>
            <div className="kpi-label">Priority customers</div>
            <div className="kpi-value">{live?.priorityWaiting ?? "—"}</div>
            <div className="kpi-foot">Checked-in online</div>
          </div>
        </div>
      </div>

      <div className="deck-grid">
        <section className="deck-main-col">
          <div className="panel current-customer-panel">
            <div className="panel-header-indigo">
              <h2>Current customer</h2>
            </div>
            <div className="current-body">
              {ticket ? (
                <>
                  <div className="ticket-hero">{ticket}</div>
                  <div className="ticket-sub">{serviceNameForTicket}</div>
                  {servingActive ? (
                    <p className="ticket-serving-badge">Serving — tap Complete when the visit is finished.</p>
                  ) : (
                    <p className="ticket-serving-warn">
                      Service not started yet — use <strong>Start service</strong> in the sidebar if needed.
                    </p>
                  )}
                </>
              ) : (
                <div className="dash-empty-customer">
                  <div className="dash-empty-icon-wrap">
                    <span className="dash-empty-icon">👤</span>
                  </div>
                  <div className="ticket-placeholder-title">No customer being served</div>
                  <div className="ticket-placeholder-sub">
                    {waiting.length} customer{waiting.length === 1 ? "" : "s"} waiting in your queue
                  </div>
                </div>
              )}
            </div>
            {!ticket ? (
              <div className="call-next-below-card">
                <button
                  type="button"
                  className="btn-call-next btn-call-next--below"
                  disabled={busy || !canCallNext}
                  title={!lanesConfigured ? "Ask your manager to assign at least one lane to this counter, then Open it." : undefined}
                  onClick={() => void onCallNext()}
                >
                  Call next customer
                </button>
              </div>
            ) : (
              <div className="current-actions">
                <button type="button" className="btn-complete" disabled={busy || !servingActive} onClick={() => void onComplete()}>
                  Complete service
                </button>
                <button
                  type="button"
                  className="btn-skip"
                  disabled={busy || !ticket}
                  title="Mark customer as no show (missed their turn)"
                  onClick={() => void onNoShow()}
                >
                  No Show
                </button>
              </div>
            )}
          </div>

          <div className="panel queue-panel">
            <div className="queue-head">
              <h2>Queue overview</h2>
              <span className="queue-sub">{waiting.length} customers waiting</span>
            </div>
            <div className="queue-progress" aria-hidden />
            <ul className="queue-list">
              {waiting.map((w) => (
                <li key={w.ticketNumber} className="queue-row">
                  <span className="queue-idx">{w.position}</span>
                  <div className="queue-main">
                    <div className="queue-ticket">{w.ticketNumber}</div>
                    <div className="queue-meta">
                      <span className="queue-lane-badge">{laneBadge}</span>
                      <span className="queue-entry-type">{w.entryType}</span>
                    </div>
                  </div>
                  <div className="queue-eta">{w.estimatedWaitMinutes == null ? "—" : `${w.estimatedWaitMinutes} min`}</div>
                </li>
              ))}
            </ul>
          </div>

          {myCounter && !lanesConfigured ? (
            <p className="lane-assigned-note lane-assigned-note--warn">
              No service lane is assigned to this counter yet. Your branch manager must tick at least one allowed lane and set the counter to{" "}
              <strong>Open</strong> before you can call customers.
            </p>
          ) : showLanePicker ? (
            <label className="lane-select">
              Service lane (manager assigns allowed lanes for this counter)
              <span className="field-hint">Call next and the list below use the lane you pick.</span>
              <select
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  void refreshWaiting();
                }}
              >
                {selectableServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : myCounter && selectableServices.length === 1 ? (
            <p className="lane-assigned-note">
              Lane for this counter: <strong>{selectableServices[0]?.name}</strong> (set by branch manager).
            </p>
          ) : null}
        </section>

        <aside className="deck-side-col">
          <div className="panel side-status-panel">
            <h2 className="side-title">My counter status</h2>
            <div className="side-card">
              <div className="side-label">Counter number</div>
              <div className="side-value-lg side-value--accent">{myCounter?.counterNumber ?? "—"}</div>
            </div>
            <div className="side-card">
              <div className="side-label">Service type / lane</div>
              <div className="side-value">{myCounter?.serviceLaneName ?? "—"}</div>
            </div>
            <div className="side-card">
              <div className="side-label">Status</div>
              <div className="side-value">{myCounter?.mode ?? "—"}</div>
              <p className="side-hint">Managers set Open / Break / Closed and assign staff to counters (up to 8 per branch).</p>
            </div>
            <div className="side-counter-actions">
              {role === "Manager" ? (
                <Link to="/manager" className="btn-counter-mode btn-counter-mode--close">
                  Close / Break (manager)
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-counter-mode btn-counter-mode--close"
                    onClick={() =>
                      window.alert(
                        "Ask your branch manager to set this counter to Closed or Break from the Manager screen.",
                      )
                    }
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn-counter-mode btn-counter-mode--break"
                    onClick={() =>
                      window.alert(
                        "Ask your branch manager to set this counter to Break from the Manager screen.",
                      )
                    }
                  >
                    Break
                  </button>
                </>
              )}
            </div>
            <div className="side-actions">
              <button
                type="button"
                className="btn-secondary-lg"
                disabled={busy || !ticket || servingActive}
                onClick={() => void onStart()}
              >
                {servingActive ? "Service started" : "Start service"}
              </button>
              <p className="side-hint">Call next usually starts service automatically; use this if it did not.</p>
            </div>
          </div>

          <details className="panel log-panel log-panel--details">
            <summary>Technical log</summary>
            <pre className="log-pre">{log.join("\n")}</pre>
          </details>
        </aside>
      </div>
    </div>
  );
}
