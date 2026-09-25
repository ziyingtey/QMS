import * as signalR from "@microsoft/signalr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiBranches,
  apiCallNext,
  apiCrossLaneWaiting,
  apiEndService,
  apiLiveDashboard,
  apiMarkMissed,
  apiMyCounter,
  apiStartService,
  apiTransferTicket,
  apiWaitingQueue,
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
import { AppTopBar } from "../components/AppTopBar";
import { CurrentCustomerPanel } from "../components/CurrentCustomerPanel";
import { EmptyState } from "../components/EmptyState";
import { KpiTile } from "../components/KpiTile";
import { StatusPill } from "../components/StatusPill";
import { useToast } from "../context/ToastContext";
import { API_BASE } from "../config";
import { useStaffLogout } from "../hooks/useStaffLogout";
import {
  clearActiveTicketSession,
  readActiveTicketSession,
  writeActiveTicketSession,
} from "../staffTicketSession";

const ALL_LANES = "__all__";

export function StaffDeckPage() {
  const logout = useStaffLogout();
  const { toast } = useToast();
  const [hubToken, setHubToken] = useState<string | null>(() => getStoredToken());
  const [email, setEmail] = useState(() => getStoredEmail());
  const [role, setRole] = useState(() => getStoredRole());
  const [loading, setLoading] = useState(true);
  const [notAssigned, setNotAssigned] = useState(false);

  useEffect(() => {
    return subscribeStaffSession(() => {
      setHubToken(getStoredToken());
      setEmail(getStoredEmail());
      setRole(getStoredRole());
    });
  }, []);

  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState(ALL_LANES);
  const [ticket, setTicket] = useState("");
  const [live, setLive] = useState<LiveDashboard | null>(null);
  const [myCounter, setMyCounter] = useState<MyCounterDto | null>(null);
  const [waiting, setWaiting] = useState<WaitingTicketDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [servingActive, setServingActive] = useState(false);
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});

  const persistTicket = useCallback(
    (t: string, serving: boolean, bId: string, sId: string) => {
      if (!t) {
        clearActiveTicketSession();
        return;
      }
      writeActiveTicketSession({ ticket: t, servingActive: serving, branchId: bId, serviceId: sId });
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      const t = await getValidStaffAccessToken();
      if (!t) {
        logout();
        return;
      }
      setHubToken(t);
      try {
        const b = await apiBranches();
        setBranches(b);
        try {
          const mc = await apiMyCounter();
          setMyCounter(mc);
          setNotAssigned(false);
          setBranchId(mc.branchId);
          const saved = readActiveTicketSession();
          if (saved?.branchId === mc.branchId && saved.ticket) {
            setTicket(saved.ticket);
            setServingActive(saved.servingActive);
          }
          // Default to cross-lane view
          setServiceId(ALL_LANES);
        } catch {
          setNotAssigned(true);
          setMyCounter(null);
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [logout, toast]);

  const refreshWaiting = useCallback(async () => {
    if (!branchId) return;
    try {
      if (serviceId === ALL_LANES) {
        setWaiting(await apiCrossLaneWaiting());
      } else {
        setWaiting(await apiWaitingQueue(branchId, serviceId));
      }
    } catch {
      setWaiting([]);
    }
  }, [branchId, serviceId]);

  const refreshLive = useCallback(async () => {
    if (!branchId) return;
    try {
      setLive(await apiLiveDashboard(branchId));
    } catch {
      setLive(null);
    }
  }, [branchId]);

  useEffect(() => {
    if (!hubToken || !branchId) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue?access_token=${encodeURIComponent(hubToken)}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();

    const bump = () => {
      void refreshWaiting();
      void refreshLive();
    };

    conn.on("QueueUpdated", bump);
    conn.on("TicketCalled", bump);
    conn.on("CountersUpdated", () => {
      bump();
      void apiMyCounter()
        .then(setMyCounter)
        .catch(() => {});
    });

    void conn
      .start()
      .then(() => conn.invoke("WatchBranch", branchId))
      .catch(() => toast("Live updates disconnected — data still refreshes every 8s.", "error"));

    conn.onreconnected(() => {
      void conn.invoke("WatchBranch", branchId).catch(() => {});
      bump();
    });

    return () => {
      void conn.stop();
    };
  }, [hubToken, branchId, refreshWaiting, refreshLive, toast]);

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
    if (!myCounter.allowedServiceTypeIds?.length) return [];
    return list.filter((s) => myCounter.allowedServiceTypeIds.includes(s.id));
  }, [branch?.services, myCounter]);

  const multiLane = selectableServices.length > 1;
  const isAllLanes = serviceId === ALL_LANES;

  const counterMode = myCounter?.mode ?? "Closed";
  const counterActive = counterMode.toLowerCase() === "active";
  const lanesConfigured = (myCounter?.allowedServiceTypeIds?.length ?? 0) > 0;
  const canCallNext = Boolean(lanesConfigured && counterActive && !ticket);

  // For "Call next", use first allowed service (backend ignores serviceId anyway — searches all lanes)
  const callNextServiceId = selectableServices[0]?.id ?? "";
  const serviceName = isAllLanes
    ? (myCounter?.listenedQueueLabels?.length
        ? myCounter.listenedQueueLabels.join(", ")
        : selectableServices.map((s) => s.name).join(", "))
    : (branch?.services.find((s) => s.id === serviceId)?.name ?? "Service");

  const onCallNext = async () => {
    if (!branchId || !canCallNext) return;
    setBusy(true);
    try {
      const r = await apiCallNext(branchId, callNextServiceId);
      if (r.ticketNumber) {
        setTicket(r.ticketNumber);
        setServingActive(false);
        try {
          await apiStartService(r.ticketNumber);
          setServingActive(true);
          persistTicket(r.ticketNumber, true, branchId, callNextServiceId);
          toast(`Now serving ${r.ticketNumber}${r.counterNumber ? ` at counter ${r.counterNumber}` : ""}`, "success");
        } catch {
          persistTicket(r.ticketNumber, false, branchId, callNextServiceId);
          toast(`${r.ticketNumber} called — tap Start service when the customer arrives.`, "info");
        }
      } else {
        toast(r.message ?? "No customers waiting.", "info");
      }
      await refreshWaiting();
      await refreshLive();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
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
      persistTicket(ticket, true, branchId, callNextServiceId);
      toast(`Service started for ${ticket}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const onNoShow = async () => {
    if (!ticket) return;
    setBusy(true);
    try {
      await apiMarkMissed(ticket);
      toast(`Marked ${ticket} as no-show`, "info");
      setTicket("");
      setServingActive(false);
      clearActiveTicketSession();
      await refreshWaiting();
      await refreshLive();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const onTransfer = async (ticketNumber: string) => {
    const targetId = transferTargets[ticketNumber];
    if (!ticketNumber || !targetId) {
      toast("Pick a target service first.", "info");
      return;
    }
    setBusy(true);
    try {
      const r = await apiTransferTicket(ticketNumber, targetId);
      toast(`Transferred ${r.previousTicketNumber} → ${r.newTicketNumber} (${r.targetServiceName})`, "success");
      if (ticket === ticketNumber) {
        setTicket("");
        setServingActive(false);
        clearActiveTicketSession();
      }
      setTransferTargets((prev) => {
        const next = { ...prev };
        delete next[ticketNumber];
        return next;
      });
      await refreshWaiting();
      await refreshLive();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (!ticket || !servingActive) return;
    setBusy(true);
    try {
      await apiEndService(ticket);
      toast(`Completed ${ticket}`, "success");
      setTicket("");
      setServingActive(false);
      clearActiveTicketSession();
      await refreshWaiting();
      await refreshLive();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="qgo-shell">
        <AppTopBar variant="staff" email={email} role={role} live={false} onLogout={logout} />
        <div className="qgo-loading">Loading workspace…</div>
      </div>
    );
  }

  if (notAssigned || !myCounter) {
    return (
      <div className="qgo-shell">
        <AppTopBar variant="staff" email={email} role={role} onLogout={logout} />
        <div className="qgo-blocked">
          <EmptyState
            title="No counter assigned"
            body="Your branch manager must assign you to a counter and configure at least one service lane before you can serve customers."
            icon="!"
          />
          {role === "Manager" ? (
            <Link to="/manager" className="qgo-btn-primary qgo-blocked__cta">
              Open manager console
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="qgo-shell qgo-shell--staff">
      <AppTopBar variant="staff" email={email} role={role} onLogout={logout} />

      <div className="qgo-staff-hero">
        <div>
          <p className="qgo-staff-hero__eyebrow">{myCounter.branchName}</p>
          <h1 className="qgo-staff-hero__title">Counter {myCounter.counterNumber}</h1>
          <p className="qgo-staff-hero__lane">{myCounter.serviceLaneName || serviceName}</p>
        </div>
        <StatusPill mode={counterMode} size="md" />
      </div>

      {!counterActive ? (
        <div className="qgo-banner qgo-banner--warn" role="status">
          Counter is <strong>{counterMode}</strong>. Ask your manager to set it to <strong>Open</strong> before calling customers.
        </div>
      ) : null}

      {!lanesConfigured ? (
        <div className="qgo-banner qgo-banner--warn" role="status">
          No service lanes assigned to this counter. Your manager must enable at least one lane in the manager console.
        </div>
      ) : null}

      <div className="qgo-kpi-row">
        <KpiTile label="Served today" value={live?.customersServedToday ?? "—"} foot="Branch total" accent="green" />
        <KpiTile label="In queue" value={live?.queueLength ?? "—"} foot="All lanes" accent="blue" />
        <KpiTile label="Avg ticket→call" value={live ? `${live.avgTicketToCallMinutes}m` : "—"} foot="Today completed" accent="amber" />
        <KpiTile label="In branch" value={live?.customersInBranch ?? "—"} foot={`${live?.activeCounters ?? "—"} active counters`} accent="navy" />
      </div>

      <div className="qgo-staff-grid">
        <CurrentCustomerPanel
          ticket={ticket}
          servingActive={servingActive}
          serviceName={serviceName}
          waitingCount={waiting.length}
          busy={busy}
          canCallNext={canCallNext}
          onCallNext={onCallNext}
          onComplete={onComplete}
          onNoShow={onNoShow}
          onStart={onStart}
        />

        <aside className="qgo-panel qgo-panel--queue">
          <header className="qgo-panel__head qgo-panel__head--split">
            <h2>Queue</h2>
            <span className="qgo-muted">{waiting.length} waiting</span>
          </header>

          {/* Lane filter: "All lanes" default for multi-service counters */}
          {multiLane ? (
            <label className="qgo-field qgo-field--compact">
              <span>Filter by lane</span>
              <select
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                }}
              >
                <option value={ALL_LANES}>All lanes (call order)</option>
                {selectableServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="qgo-lane-note">
              Lane: <strong>{selectableServices[0]?.name ?? "—"}</strong>
            </p>
          )}

          {multiLane && !isAllLanes ? (
            <p className="qgo-staff-callnext-hint">
              Call next uses longest-wait across all your queues; filter only changes this list.
            </p>
          ) : null}

          <ul className="qgo-queue-list">
            {waiting.length === 0 ? (
              <li className="qgo-queue-empty">
                {isAllLanes ? "Queue is empty across all lanes." : "Queue is empty for this lane."}
              </li>
            ) : (
              waiting.map((w) => (
                <li key={w.ticketNumber} className="qgo-queue-item">
                  <span className="qgo-queue-pos">{w.position}</span>
                  <div className="qgo-queue-main">
                    <strong>{w.ticketNumber}</strong>
                    <span className="qgo-muted">{w.entryType}</span>
                    {isAllLanes && w.serviceName ? (
                      <span className="qgo-queue-svc-badge">{w.serviceName}</span>
                    ) : null}
                    <div className="qgo-transfer-row">
                      <select
                        aria-label={`Transfer ${w.ticketNumber}`}
                        value={transferTargets[w.ticketNumber] ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          setTransferTargets((prev) => ({ ...prev, [w.ticketNumber]: e.target.value }))
                        }
                      >
                        <option value="">Transfer to…</option>
                        {(branch?.services ?? [])
                          .filter((s) => s.name !== w.serviceName)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="qgo-btn-ghost"
                        disabled={busy || !transferTargets[w.ticketNumber]}
                        onClick={() => void onTransfer(w.ticketNumber)}
                      >
                        Go
                      </button>
                    </div>
                  </div>
                  <div className="qgo-queue-right">
                    {w.checkedIn ? <span className="qgo-queue-checkin">✓</span> : null}
                    <span className="qgo-queue-eta">{w.estimatedWaitMinutes == null ? "—" : `~${w.estimatedWaitMinutes}m`}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
