import * as signalR from "@microsoft/signalr";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiBranches,
  apiCallNext,
  apiEndService,
  apiLiveDashboard,
  apiMyCounter,
  apiStartService,
  apiWaitingQueue,
  clearStoredSession,
  getStoredEmail,
  getStoredRole,
  getStoredToken,
  type BranchDto,
  type LiveDashboard,
  type MyCounterDto,
  type WaitingTicketDto,
} from "../api";
import { API_BASE } from "../config";

export function StaffDeckPage() {
  const navigate = useNavigate();
  const token = useMemo(() => getStoredToken(), []);
  const role = useMemo(() => getStoredRole(), []);
  const email = useMemo(() => getStoredEmail(), []);

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
    if (!token) {
      navigate("/login");
      return;
    }
    void (async () => {
      try {
        const b = await apiBranches();
        setBranches(b);
        try {
          const mc = await apiMyCounter(token);
          setMyCounter(mc);
          setBranchId(mc.branchId);
          const br = b.find((x) => x.id === mc.branchId);
          const list = br?.services ?? [];
          const filtered =
            !mc.allowedServiceTypeIds || mc.allowedServiceTypeIds.length === 0
              ? list
              : list.filter((s) => mc.allowedServiceTypeIds.includes(s.id));
          const pick = filtered[0] ?? list[0];
          if (pick) setServiceId(pick.id);
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
  }, [navigate, token, push]);

  const refreshWaiting = useCallback(async () => {
    if (!token || !branchId || !serviceId) return;
    try {
      const w = await apiWaitingQueue(token, branchId, serviceId);
      setWaiting(w);
    } catch {
      setWaiting([]);
    }
  }, [token, branchId, serviceId]);

  const refreshLive = useCallback(async () => {
    if (!token || !branchId) return;
    try {
      const d = await apiLiveDashboard(token, branchId);
      setLive(d);
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    }
  }, [token, branchId, push]);

  useEffect(() => {
    if (!token || !branchId) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect()
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
          const mc = await apiMyCounter(token);
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
  }, [token, branchId, push, refreshWaiting, refreshLive]);

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
    if (!myCounter || myCounter.allowedServiceTypeIds.length === 0) return list;
    const filtered = list.filter((s) => myCounter.allowedServiceTypeIds.includes(s.id));
    return filtered.length > 0 ? filtered : list;
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

  const onCallNext = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !branchId || !serviceId) return;
    setBusy(true);
    try {
      const r = await apiCallNext(token, branchId, serviceId);
      if (r.ticketNumber) {
        setTicket(r.ticketNumber);
        setServingActive(false);
        try {
          await apiStartService(token, r.ticketNumber);
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
    if (!token || !ticket) return;
    setBusy(true);
    try {
      await apiStartService(token, ticket);
      setServingActive(true);
      push(`Start ${ticket}`);
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (!token || !ticket || !servingActive) return;
    setBusy(true);
    try {
      await apiEndService(token, ticket);
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

  return (
    <div className="deck-page">
      <header className="deck-topbar">
        <div className="brand-inline">
          <span className="brand-mark" />
          <span className="brand-text">IH-QMS</span>
        </div>
        <div className="topbar-center">
          <div className="staff-chip">
            <div className="staff-chip-title">Counter {myCounter?.counterNumber ?? "—"}</div>
            <div className="staff-chip-sub">{displayName}</div>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="live-pill" title="SignalR live updates">
            <span className="live-dot" /> Live
          </span>
          {role === "Manager" ? (
            <Link to="/manager" className="link-muted">
              Branch manager →
            </Link>
          ) : null}
          <span className="branch-pill">{myCounter?.branchName ?? branch?.name ?? "Branch"}</span>
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </header>

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
                  <div className="ticket-sub">{branch?.services.find((s) => s.id === serviceId)?.name ?? "Service"}</div>
                  {servingActive ? (
                    <p className="ticket-serving-badge">Serving — you can complete when finished</p>
                  ) : (
                    <p className="ticket-serving-warn">Service not started — use Start service (sidebar) if the button did not run.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="ticket-placeholder-title">No customer being served</div>
                  <div className="ticket-placeholder-sub">
                    {waiting.length} customer{waiting.length === 1 ? "" : "s"} waiting in this lane
                  </div>
                </>
              )}
            </div>
            <div className="current-actions">
              <button
                type="button"
                className="btn-complete"
                disabled={busy || !ticket || !servingActive}
                title={ticket && !servingActive ? "Start service first (or wait for auto-start after Call next)" : undefined}
                onClick={() => void onComplete()}
              >
                Complete service
              </button>
              <button type="button" className="btn-skip" disabled={busy || !ticket} onClick={() => push("Skip: use manager transfer in a full build")}>
                Skip
              </button>
            </div>
          </div>

          <form className="call-next-bar" onSubmit={(e) => void onCallNext(e)}>
            <button type="submit" className="btn-call-next" disabled={busy}>
              Call next customer
            </button>
          </form>

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
                    <div className="queue-meta">{w.entryType}</div>
                  </div>
                  <div className="queue-eta">{w.estimatedWaitMinutes == null ? "—" : `${w.estimatedWaitMinutes} min`}</div>
                </li>
              ))}
            </ul>
          </div>

          <label className="lane-select">
            Service lane (call next &amp; queue list)
            <span className="field-hint">
              {myCounter && myCounter.allowedServiceTypeIds.length > 0
                ? "Showing lanes this counter may serve."
                : "General counter: pick any branch lane."}
            </span>
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
        </section>

        <aside className="deck-side-col">
          <div className="panel side-status-panel">
            <h2 className="side-title">My counter status</h2>
            <div className="side-card">
              <div className="side-label">Counter number</div>
              <div className="side-value-lg">{myCounter?.counterNumber ?? "—"}</div>
            </div>
            <div className="side-card">
              <div className="side-label">Service type</div>
              <div className="side-value">{myCounter?.serviceLaneName ?? "—"}</div>
            </div>
            <div className="side-card">
              <div className="side-label">Status (read only)</div>
              <div className="side-value">{myCounter?.mode ?? "—"}</div>
              <p className="side-hint">Open / break / closed is controlled by a branch manager.</p>
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
              <p className="side-hint">Call next auto-starts service; use this if auto-start failed.</p>
            </div>
          </div>

          <div className="panel log-panel">
            <h3>Live log</h3>
            <pre className="log-pre">{log.join("\n")}</pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
