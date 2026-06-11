import * as signalR from "@microsoft/signalr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiBranches,
  apiLiveDashboard,
  apiManagerAssignableStaff,
  apiManagerCounters,
  apiManagerInsights,
  apiManagerOperationalSettings,
  apiManagerPatchOperationalSettings,
  apiManagerSetAllowedServices,
  apiManagerSetCounterMode,
  apiManagerSetCounterStaff,
  apiManagerSetDedicatedLane,
  clearStoredSession,
  getStoredBranchId,
  getStoredEmail,
  getStoredRole,
  getStoredToken,
  getValidStaffAccessToken,
  subscribeStaffSession,
  type AssignableStaffDto,
  type BranchDto,
  type BranchOperatingHourRow,
  type BranchOperationalSettings,
  type LiveDashboard,
  type ManagerCounterRowDto,
  type ManagerInsights,
  type ManagerLaneAnalytics,
} from "../api";
import { API_BASE } from "../config";

function minsToClock(m: number): string {
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${h}:${mi.toString().padStart(2, "0")}`;
}

function defaultWeeklyHours(): BranchOperatingHourRow[] {
  const row = (day: string, weekend: boolean): BranchOperatingHourRow =>
    weekend
      ? { dayOfWeek: day, isClosed: true, openMinutesFromMidnight: null, closeMinutesFromMidnight: null }
      : {
          dayOfWeek: day,
          isClosed: false,
          openMinutesFromMidnight: 9 * 60,
          closeMinutesFromMidnight: 17 * 60,
        };
  return [
    row("Monday", false),
    row("Tuesday", false),
    row("Wednesday", false),
    row("Thursday", false),
    row("Friday", false),
    row("Saturday", true),
    row("Sunday", true),
  ];
}

const MGR_SVC_COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04"];

function crowdFromQueue(n: number): { label: string; level: "low" | "medium" | "high" } {
  if (n <= 5) return { label: "Low", level: "low" };
  if (n <= 15) return { label: "Medium", level: "medium" };
  return { label: "High", level: "high" };
}

function staffDisplayName(r: ManagerCounterRowDto, pick: AssignableStaffDto[]): string {
  if (!r.assignedStaffEmail) return "Unassigned";
  return pick.find((s) => s.email === r.assignedStaffEmail)?.name ?? r.assignedStaffEmail;
}

function ServiceCompletedMixChart({ lanes }: { lanes: ManagerLaneAnalytics[] }) {
  const total = lanes.reduce((s, l) => s + Math.max(0, l.completedToday), 0);
  if (lanes.length === 0) return <p className="muted small-print">No lane analytics yet.</p>;
  if (total === 0) {
    return (
      <div className="mgr-chart-empty">
        <h3 className="mgr-chart-title">Service mix (completed today)</h3>
        <p className="muted small-print">No completed visits yet — the bar will fill as tickets finish.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="mgr-chart-title">Service mix (completed today)</h3>
      <div className="mgr-stacked-track" role="img" aria-label="Share of completed visits by service lane">
        {lanes.map((l, i) => (
          <div
            key={l.serviceTypeId}
            className="mgr-stacked-seg"
            style={{
              width: `${(Math.max(0, l.completedToday) / total) * 100}%`,
              background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length],
            }}
            title={`${l.serviceName}: ${l.completedToday}`}
          />
        ))}
      </div>
      <ul className="mgr-legend">
        {lanes.map((l, i) => (
          <li key={l.serviceTypeId}>
            <span className="mgr-swatch" style={{ background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length] }} />
            <span>{l.serviceName}</span>
            <strong>{l.completedToday}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LaneThroughputBars({ lanes }: { lanes: ManagerLaneAnalytics[] }) {
  const max = Math.max(1, ...lanes.map((l) => l.completedToday));
  return (
    <div>
      <h3 className="mgr-chart-title">Throughput by lane (today)</h3>
      <div className="mgr-bars">
        {lanes.map((l, i) => (
          <div key={l.serviceTypeId} className="mgr-bar-row">
            <span className="mgr-bar-name">{l.serviceName}</span>
            <div className="mgr-bar-track">
              <div
                className="mgr-bar-fill"
                style={{
                  width: `${(l.completedToday / max) * 100}%`,
                  background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length],
                }}
              />
            </div>
            <span className="mgr-bar-num">{l.completedToday}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SnapshotWaitBars({
  byService,
  resolveName,
}: {
  byService: LiveDashboard["byService"];
  resolveName: (id: string) => string;
}) {
  const data = byService.map((row) => ({
    id: row.serviceTypeId,
    name: resolveName(row.serviceTypeId),
    w: row.estimatedWaitMinutes,
  }));
  const maxW = Math.max(1, ...data.map((d) => (d.w == null ? 0 : d.w)));
  return (
    <div>
      <h3 className="mgr-chart-title">Estimated wait by lane (live snapshot)</h3>
      <p className="muted small-print mgr-chart-note">Uses the current dashboard estimate per lane — not an hourly trend chart.</p>
      <div className="mgr-bars">
        {data.map((d, i) => (
          <div key={d.id} className="mgr-bar-row">
            <span className="mgr-bar-name">{d.name}</span>
            <div className="mgr-bar-track">
              <div
                className="mgr-bar-fill mgr-bar-fill--wait"
                style={{
                  width: `${d.w == null ? 0 : Math.min(100, (d.w / maxW) * 100)}%`,
                  background: MGR_SVC_COLORS[i % MGR_SVC_COLORS.length],
                }}
              />
            </div>
            <span className="mgr-bar-num">{d.w == null ? "—" : `${Math.round(d.w)}m`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ManagerCountersPage() {
  const navigate = useNavigate();
  const [hubToken, setHubToken] = useState<string | null>(() => getStoredToken());

  useEffect(() => {
    return subscribeStaffSession(() => setHubToken(getStoredToken()));
  }, []);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState(() => getStoredBranchId() ?? "");
  const [rows, setRows] = useState<ManagerCounterRowDto[]>([]);
  const [live, setLive] = useState<LiveDashboard | null>(null);
  const [settings, setSettings] = useState<BranchOperationalSettings | null>(null);
  const [insights, setInsights] = useState<ManagerInsights | null>(null);
  const [staffPickList, setStaffPickList] = useState<AssignableStaffDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Split manager work like typical ops consoles (e.g. bank back-office): floor vs policy vs analytics. */
  const [managerTab, setManagerTab] = useState<"counters" | "capacity" | "queue">("counters");
  const [expandedCounterId, setExpandedCounterId] = useState<string | null>(null);

  const [formOnline, setFormOnline] = useState(70);
  const [formSlot, setFormSlot] = useState(30);
  const [formWeekly, setFormWeekly] = useState<BranchOperatingHourRow[]>(defaultWeeklyHours);
  const [formAdaptiveCap, setFormAdaptiveCap] = useState(true);
  const [formMinSlotTotal, setFormMinSlotTotal] = useState("");
  const [formMaxSlotTotal, setFormMaxSlotTotal] = useState("");
  const [formEarlyCallMinutes, setFormEarlyCallMinutes] = useState(10);
  const [formCalledGraceMinutes, setFormCalledGraceMinutes] = useState(5);

  const branch = branches.find((b) => b.id === branchId);
  const managerEmail = useMemo(() => getStoredEmail(), []);

  useEffect(() => {
    setExpandedCounterId(null);
  }, [branchId]);

  useEffect(() => {
    void (async () => {
      if (getStoredRole() !== "Manager") {
        navigate("/login");
        return;
      }
      const t = await getValidStaffAccessToken();
      if (!t) {
        navigate("/login");
        return;
      }
      setHubToken(t);
      const b = await apiBranches();
      setBranches(b);
      setBranchId((prev) => prev || (b[0]?.id ?? ""));
    })();
  }, [navigate]);

  useEffect(() => {
    if (!branchId) return;
    void (async () => {
      try {
        const list = await apiManagerAssignableStaff(branchId);
        setStaffPickList(list);
      } catch (err) {
        console.error("[staff-pick-list] failed for branch", branchId, err);
        setStaffPickList([]);
      }
    })();
  }, [branchId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setBusy(true);
    try {
      const list = await apiManagerCounters(branchId);
      setRows(list);
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [branchId]);

  const loadSettings = useCallback(async () => {
    if (!branchId) return;
    try {
      const s = await apiManagerOperationalSettings(branchId);
      setSettings(s);
      setFormOnline(s.onlineQuotaPercent);
      setFormSlot(s.slotDurationMinutes);
      const w = s.weeklyOperatingHours;
      setFormWeekly(
        w && w.length === 7
          ? w.map((r) => ({
              dayOfWeek: r.dayOfWeek,
              isClosed: r.isClosed,
              openMinutesFromMidnight: r.openMinutesFromMidnight,
              closeMinutesFromMidnight: r.closeMinutesFromMidnight,
            }))
          : defaultWeeklyHours(),
      );
      setFormAdaptiveCap(s.adaptiveSlotCapacityEnabled ?? true);
      setFormMinSlotTotal(s.minSlotTotalCapacity != null ? String(s.minSlotTotalCapacity) : "");
      setFormMaxSlotTotal(s.maxSlotTotalCapacity != null ? String(s.maxSlotTotalCapacity) : "");
      setFormEarlyCallMinutes(s.onlineEarlyCallMinutes ?? 10);
      setFormCalledGraceMinutes(s.calledAbsentGraceMinutes ?? 5);
    } catch {
      setSettings(null);
    }
  }, [branchId]);

  const loadInsights = useCallback(async () => {
    if (!branchId) return;
    try {
      setInsights(await apiManagerInsights(branchId));
    } catch {
      setInsights(null);
    }
  }, [branchId]);

  const refreshLive = useCallback(async () => {
    if (!branchId) return;
    try {
      setLive(await apiLiveDashboard(branchId));
    } catch {
      setLive(null);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshLive();
    void loadSettings();
    void loadInsights();
  }, [refreshLive, loadSettings, loadInsights]);

  useEffect(() => {
    if (!hubToken || !branchId) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue?access_token=${encodeURIComponent(hubToken)}`)
      .configureLogging(signalR.LogLevel.None)
      .withAutomaticReconnect()
      .build();

    const bump = () => {
      void load();
      void refreshLive();
      void loadInsights();
      void loadSettings();
    };

    conn.on("QueueUpdated", bump);
    conn.on("CountersUpdated", bump);
    conn.on("TicketCalled", () => {
      void refreshLive();
      void loadInsights();
    });

    const watch = () => {
      void conn.invoke("WatchBranch", branchId).catch(() => {});
    };

    void conn
      .start()
      .then(watch)
      .catch((e: unknown) => {
        setMessage(`Live updates disconnected: ${e instanceof Error ? e.message : String(e)}. Data will still refresh every 12s.`);
      });

    conn.onreconnected(() => {
      watch();
      bump();
    });

    return () => {
      void conn.stop();
    };
  }, [hubToken, branchId, load, refreshLive, loadInsights, loadSettings]);

  useEffect(() => {
    if (!branchId) return;
    const id = setInterval(() => {
      void refreshLive();
      void loadInsights();
      void load();
    }, 12_000);
    return () => clearInterval(id);
  }, [branchId, refreshLive, loadInsights, load]);

  const setMode = async (counterId: string, mode: "Active" | "Break" | "Closed") => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerSetCounterMode(branchId, counterId, mode);
      await load();
      await refreshLive();
      await loadInsights();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAllowedLaneToggle = async (counterId: string, laneId: string, checked: boolean) => {
    if (!branchId) return;
    const row = rows.find((r) => r.id === counterId);
    if (!row) return;
    const next = new Set(row.allowedServiceTypeIds);
    if (checked) next.add(laneId);
    else next.delete(laneId);
    if (next.size === 0) {
      setMessage("Keep at least one allowed lane, or set the counter to Closed. (Empty lane set is not allowed.)");
      return;
    }
    setBusy(true);
    try {
      await apiManagerSetAllowedServices(branchId, counterId, [...next]);
      await load();
      await refreshLive();
      await loadInsights();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onStaffChange = async (counterId: string, value: string) => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerSetCounterStaff(branchId, counterId, value === "" ? null : value);
      await load();
      await refreshLive();
      await loadInsights();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDedicatedLaneChange = async (counterId: string, serviceTypeId: string) => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerSetDedicatedLane(branchId, counterId, serviceTypeId === "" ? null : serviceTypeId);
      await load();
      await refreshLive();
      await loadInsights();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveCapacity = async () => {
    if (!branchId) return;
    setBusy(true);
    setMessage(null);
    try {
      const minRaw = formMinSlotTotal.trim();
      const maxRaw = formMaxSlotTotal.trim();
      const s = await apiManagerPatchOperationalSettings(branchId, {
        onlineQuotaPercent: formOnline,
        slotDurationMinutes: formSlot,
        weeklyOperatingHours: formWeekly,
        adaptiveSlotCapacityEnabled: formAdaptiveCap,
        onlineEarlyCallMinutes: formEarlyCallMinutes,
        calledAbsentGraceMinutes: formCalledGraceMinutes,
        ...(minRaw === "" ? { clearMinSlotTotalCapacity: true } : { minSlotTotalCapacity: Number(minRaw) }),
        ...(maxRaw === "" ? { clearMaxSlotTotalCapacity: true } : { maxSlotTotalCapacity: Number(maxRaw) }),
      });
      setSettings(s);
      await loadInsights();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    clearStoredSession();
    navigate("/login");
  };

  const staffIdForRow = (r: ManagerCounterRowDto): string => {
    if (!r.assignedStaffEmail) return "";
    const m = staffPickList.find((s) => s.email === r.assignedStaffEmail);
    return m?.id ?? "";
  };

  const crowd = live ? crowdFromQueue(live.queueLength) : null;

  return (
    <div className="deck-page deck-page--manager">
      <header className="deck-topbar manager-topbar">
        <div className="brand-inline">
          <span className="brand-mark" />
          <span className="brand-text">IH-QMS</span>
          <span className="manager-topbar-tag">Manager</span>
        </div>
        <div className="topbar-actions manager-topbar-actions">
          <span className="mgr-bell" aria-hidden title="Notifications">
            🔔
          </span>
          <span className="live-pill" title="SignalR live updates + 12s backup refresh (dashboard, insights, counters)">
            <span className="live-dot" /> Live
          </span>
          <Link to="/" className="link-muted">
            Counter workspace
          </Link>
          <div className="manager-user-chip" title={managerEmail ?? "Signed in"}>
            <span className="manager-user-avatar" aria-hidden>
              {(managerEmail ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="manager-user-email">{managerEmail ?? "—"}</span>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </header>

      <main className="manager-main">
        <header className="manager-page-head">
          <h1 className="section-title">Branch live monitor</h1>
          <p className="manager-page-sub">
            High-level view similar to a branch dashboard: KPIs first, then counter tiles, booking policy in its own tab, and lane analytics with simple charts where data exists.
          </p>
        </header>

        <div className="manager-toolbar">
          <label className="select-row manager-branch-select">
            Branch: <strong>{branch?.name ?? "—"}</strong>
          </label>
        </div>

        {message ? <p className="error">{message}</p> : null}

        {live ? (
          <div className="manager-kpi-dash">
            <div className="manager-kpi-tile">
              <span className="manager-kpi-tile-icon manager-kpi-tile-icon--success" aria-hidden>
                ✓
              </span>
              <div>
                <div className="manager-kpi-tile-label">Customers served</div>
                <div className="manager-kpi-tile-val">{live.customersServedToday}</div>
                <div className="manager-kpi-tile-foot">Today</div>
              </div>
            </div>
            <div className="manager-kpi-tile">
              <span className="manager-kpi-tile-icon manager-kpi-tile-icon--queue" aria-hidden>
                ⏳
              </span>
              <div>
                <div className="manager-kpi-tile-label">Waiting (all lanes)</div>
                <div className="manager-kpi-tile-val">{live.queueLength}</div>
                <div className="manager-kpi-tile-foot">Tickets in queue</div>
              </div>
            </div>
            <div className="manager-kpi-tile">
              <span className="manager-kpi-tile-icon manager-kpi-tile-icon--crowd" aria-hidden>
                ◎
              </span>
              <div>
                <div className="manager-kpi-tile-label">Crowd level</div>
                <div className="manager-kpi-tile-val">
                  <span className={`mgr-crowd-pill mgr-crowd-pill--${crowd!.level}`}>{crowd!.label}</span>
                </div>
                <div className="manager-kpi-tile-foot">From queue depth</div>
              </div>
            </div>
            <div className="manager-kpi-tile">
              <span className="manager-kpi-tile-icon manager-kpi-tile-icon--clock" aria-hidden>
                🕐
              </span>
              <div>
                <div className="manager-kpi-tile-label">Avg wait (branch)</div>
                <div className="manager-kpi-tile-val">{live.avgWaitMinutes}m</div>
                <div className="manager-kpi-tile-foot">{live.activeCounters} active counters</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="muted small-print manager-live-fallback">Loading live snapshot…</p>
        )}

        <nav className="manager-tabs" aria-label="Manager sections">
          <button
            type="button"
            className={managerTab === "counters" ? "is-active" : undefined}
            onClick={() => setManagerTab("counters")}
          >
            Live floor &amp; counters
          </button>
          <button
            type="button"
            className={managerTab === "capacity" ? "is-active" : undefined}
            onClick={() => setManagerTab("capacity")}
          >
            Booking &amp; weekly schedule
          </button>
          <button type="button" className={managerTab === "queue" ? "is-active" : undefined} onClick={() => setManagerTab("queue")}>
            Queue &amp; charts
          </button>
        </nav>

        {managerTab === "counters" ? (
          <section className="manager-dash-panel manager-tab-panel" aria-labelledby="mgr-floor-heading">
            <div className="manager-dash-panel-head">
              <h2 id="mgr-floor-heading" className="manager-dash-panel-title">
                Counter status
              </h2>
              <p className="manager-dash-panel-sub muted">
                Each tile shows who is on the desk and lane routing. Use <strong>Configure</strong> to assign teller, allowed lanes, and primary display lane — like a branch monitoring wall with drill-down.
              </p>
            </div>
            <div className="manager-counter-grid manager-counter-grid--monitor">
              {rows.map((r) => {
                const expanded = expandedCounterId === r.id;
                const modeKey = r.mode.toLowerCase();
                return (
                  <article key={r.id} className={`mgr-monitor-card${expanded ? " mgr-monitor-card--open" : ""}`}>
                    <div className="mgr-monitor-top">
                      <span className={`mgr-status-dot mgr-status-dot--${modeKey}`} title={r.mode} />
                      <div className="mgr-monitor-top-main">
                        <div className="mgr-monitor-title-row">
                          <h3 className="mgr-monitor-title">Counter {r.number}</h3>
                          <button
                            type="button"
                            className="mgr-link-btn"
                            onClick={() => setExpandedCounterId(expanded ? null : r.id)}
                          >
                            {expanded ? "Hide" : "Configure"}
                          </button>
                        </div>
                        <div className="mgr-monitor-staff">{staffDisplayName(r, staffPickList)}</div>
                        <dl className="mgr-monitor-dl">
                          <div>
                            <dt>Status</dt>
                            <dd>
                              <span className={`mode-pill mode-${modeKey}`}>{r.mode}</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Allowed lanes</dt>
                            <dd className="mgr-monitor-dd-clip" title={r.allowedLanesDisplay}>
                              {r.allowedServiceTypeIds.length === 0 ? "None — assign in Configure" : r.allowedLanesDisplay}
                            </dd>
                          </div>
                          <div>
                            <dt>Primary display</dt>
                            <dd>{r.currentDedicatedLaneName ?? "—"}</dd>
                          </div>
                        </dl>
                        <div className="mgr-ticket-placeholder" role="note">
                          Active ticket and dwell time appear on the teller workspace; manager API does not stream per-counter tickets yet.
                        </div>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="mgr-monitor-form">
                        <label className="manager-field">
                          <span className="manager-field-label">Teller</span>
                          <select
                            className="manager-select"
                            value={staffIdForRow(r)}
                            disabled={busy}
                            onChange={(e) => void onStaffChange(r.id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {staffPickList.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.email})
                              </option>
                            ))}
                          </select>
                        </label>
                        <fieldset className="manager-fieldset">
                          <legend>Allowed lanes</legend>
                          {r.mode === "Closed" ? (
                            <p className="manager-fieldset-hint muted small-print">
                              Counter 已关闭，以下 lane 不计入 capacity。开启前请先配置。
                            </p>
                          ) : null}
                          <p className="manager-fieldset-hint muted small-print">
                            {r.allowedServiceTypeIds.length === 0 ? (
                              <strong>No lanes yet</strong>
                            ) : (
                              <>
                                <strong>Allowed:</strong> {r.allowedLanesDisplay}
                              </>
                            )}
                          </p>
                          <div className="manager-lane-picks manager-lane-picks--card">
                            {(branch?.services ?? []).map((s) => (
                              <label key={s.id} className="manager-lane-check">
                                <input
                                  type="checkbox"
                                  checked={r.allowedServiceTypeIds.includes(s.id)}
                                  disabled={busy}
                                  onChange={(e) => void onAllowedLaneToggle(r.id, s.id, e.target.checked)}
                                />
                                <span>{s.name}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <label className="manager-field">
                          <span className="manager-field-label">Primary lane (counter display)</span>
                          <select
                            className="manager-select"
                            value={r.currentDedicatedServiceTypeId ?? ""}
                            disabled={busy}
                            onChange={(e) => void onDedicatedLaneChange(r.id, e.target.value)}
                          >
                            <option value="">None</option>
                            {(branch?.services ?? []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}
                    <footer className="mgr-monitor-actions">
                      <button
                        type="button"
                        className="btn-sm btn-open"
                        disabled={busy || r.allowedServiceTypeIds.length === 0}
                        title={r.allowedServiceTypeIds.length === 0 ? "Assign at least one lane before Open" : undefined}
                        onClick={() => void setMode(r.id, "Active")}
                      >
                        Open
                      </button>
                      <button type="button" className="btn-sm btn-break" disabled={busy} onClick={() => void setMode(r.id, "Break")}>
                        Break
                      </button>
                      <button type="button" className="btn-sm btn-close" disabled={busy} onClick={() => void setMode(r.id, "Closed")}>
                        Closed
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
            {rows.length === 0 ? <p className="muted">No counters for this branch.</p> : null}
          </section>
        ) : null}

        {managerTab === "capacity" ? (
          <>
            <details className="manager-help">
              <summary>How queue routing &amp; capacity relate (real-time)</summary>
              <ol className="manager-flow-list">
                <li>
                  <strong>Customer</strong> picks a <strong>branch</strong> and a <strong>service type</strong> (lane). Their ticket is stored on that lane’s queue.
                </li>
                <li>
                  <strong>Call next</strong> only pulls from that lane. A counter counts toward a lane only if it is <strong>Open (Active)</strong> and its <strong>allowed lanes</strong> include that service type (at least one lane is required — there is no all-lanes fallback).
                </li>
                <li>
                  <strong>Capacity</strong> (slots, online vs walk-in split) uses <strong>active</strong> counters that can serve the lane — so opening/closing counters or changing allowed lanes immediately changes crowding and ETAs (SignalR pushes updates).
                </li>
                <li>
                  <strong>Adaptive slot capacity</strong> (when enabled): manager alerts compare the next booking window’s live seat count (from counters) to active bookings so you see pressure before the grid fills.
                </li>
              </ol>
            </details>
            <section className="manager-section manager-tab-panel manager-dash-panel manager-dash-panel--flat">
          <h2 className="manager-subtitle">Capacity control (online % · slot length · weekly hours)</h2>
          <p className="muted small-print">
            Online % reserves booking capacity; the remainder is the walk-in buffer. Slot length drives how many customers fit per window per open counter.
            Bookable windows follow the weekly grid below (branch local calendar; demo zone UTC+8). Per-slot limits are computed from open counters, slot length, and service duration; optional min/max clamp that total. When adaptive alerts are on, insights flag overbooked upcoming windows vs current counters.
          </p>
          {settings ? (
            <p className="muted small-print">
              Current zone offset: <strong>UTC+{settings.serviceZoneOffsetMinutes / 60}</strong> · Walk-in quota shown:{" "}
              <strong>{settings.walkInQuotaPercent}%</strong>
            </p>
          ) : null}
          <div className="manager-settings-grid">
            <label>
              Online booking %
              <input
                type="number"
                min={0}
                max={100}
                value={formOnline}
                onChange={(e) => setFormOnline(Number(e.target.value))}
              />
            </label>
            <label>
              Slot duration (minutes)
              <input type="number" min={5} max={180} value={formSlot} onChange={(e) => setFormSlot(Number(e.target.value))} />
            </label>
            <label title="Unchecked online may enter the call pool this many minutes before their booking slot starts.">
              Online early call (minutes before slot)
              <input
                type="number"
                min={0}
                max={120}
                value={formEarlyCallMinutes}
                onChange={(e) => setFormEarlyCallMinutes(Number(e.target.value))}
              />
            </label>
            <label title="After Call next, if Start service is not used within this time, the ticket is released as no-show.">
              Called → absent if no start (minutes)
              <input
                type="number"
                min={1}
                max={60}
                value={formCalledGraceMinutes}
                onChange={(e) => setFormCalledGraceMinutes(Number(e.target.value))}
              />
            </label>
            <div className="manager-weekly-hours" style={{ gridColumn: "1 / -1" }}>
              <h3 className="manager-h3">Weekly schedule (minutes from midnight)</h3>
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Closed</th>
                      <th>Open (min)</th>
                      <th>Close (min)</th>
                      <th>Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formWeekly.map((r, idx) => (
                      <tr key={r.dayOfWeek}>
                        <td>{r.dayOfWeek}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.isClosed}
                            onChange={(e) => {
                              const closed = e.target.checked;
                              setFormWeekly((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        isClosed: closed,
                                        openMinutesFromMidnight: closed ? null : x.openMinutesFromMidnight ?? 9 * 60,
                                        closeMinutesFromMidnight: closed ? null : x.closeMinutesFromMidnight ?? 17 * 60,
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={1439}
                            disabled={r.isClosed}
                            value={r.openMinutesFromMidnight ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              setFormWeekly((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, openMinutesFromMidnight: v } : x)),
                              );
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            disabled={r.isClosed}
                            value={r.closeMinutesFromMidnight ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              setFormWeekly((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, closeMinutesFromMidnight: v } : x)),
                              );
                            }}
                          />
                        </td>
                        <td className="muted small-print">
                          {r.isClosed || r.openMinutesFromMidnight == null || r.closeMinutesFromMidnight == null
                            ? "—"
                            : `${minsToClock(r.openMinutesFromMidnight)}–${minsToClock(r.closeMinutesFromMidnight)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <label className="manager-check-row">
              <input
                type="checkbox"
                checked={formAdaptiveCap}
                onChange={(e) => setFormAdaptiveCap(e.target.checked)}
              />
              <span>Adaptive booking-pressure alerts (compare next window bookings vs counter-based seat cap)</span>
            </label>
            <label>
              Min total customers / slot (optional floor)
              <input
                type="number"
                min={0}
                placeholder="— none —"
                value={formMinSlotTotal}
                onChange={(e) => setFormMinSlotTotal(e.target.value)}
              />
            </label>
            <label>
              Max total customers / slot (optional ceiling)
              <input
                type="number"
                min={1}
                placeholder="— none —"
                value={formMaxSlotTotal}
                onChange={(e) => setFormMaxSlotTotal(e.target.value)}
              />
            </label>
          </div>
          <button type="button" className="btn-primary-lg manager-save-cap" disabled={busy} onClick={() => void saveCapacity()}>
            Save capacity, weekly hours &amp; adaptive rules
          </button>
        </section>
          </>
        ) : null}

        {managerTab === "queue" ? (
          <>
            {live && live.byService.length > 0 ? (
              <section className="manager-section manager-tab-panel">
                <h2 className="manager-subtitle">Live queue by service lane</h2>
                <div className="manager-table-wrap">
                  <table className="manager-table">
                    <thead>
                      <tr>
                        <th>Lane</th>
                        <th>Waiting</th>
                        <th>ETA (est.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.byService.map((row) => {
                        const name = branch?.services.find((s) => s.id === row.serviceTypeId)?.name ?? row.serviceTypeId;
                        return (
                          <tr key={row.serviceTypeId}>
                            <td>{name}</td>
                            <td>{row.queueLength}</td>
                            <td>{row.estimatedWaitMinutes == null ? "—" : `${row.estimatedWaitMinutes} min`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {(insights != null && insights.lanes.length > 0) || (live != null && live.byService.length > 0) ? (
              <section className="manager-dash-panel manager-tab-panel">
                <h2 className="manager-dash-panel-title">Visual summaries</h2>
                <p className="muted small-print manager-dash-panel-sub">
                  Mix and throughput use <strong>completed today per lane</strong> from insights; the wait strip uses the <strong>live</strong> estimate per lane. Intraday hourly curves (like classic branch monitors) need a time-series reporting feed — this is the same layout pattern with current API data.
                </p>
                <div className="mgr-chart-grid">
                  {insights != null && insights.lanes.length > 0 ? (
                    <div className="mgr-chart-cell mgr-chart-cell--panel">
                      <ServiceCompletedMixChart lanes={insights.lanes} />
                    </div>
                  ) : null}
                  {insights != null && insights.lanes.length > 0 ? (
                    <div className="mgr-chart-cell mgr-chart-cell--panel">
                      <LaneThroughputBars lanes={insights.lanes} />
                    </div>
                  ) : null}
                  {live != null && live.byService.length > 0 ? (
                    <div className="mgr-chart-cell mgr-chart-cell--panel mgr-chart-cell--wide">
                      <SnapshotWaitBars
                        byService={live.byService}
                        resolveName={(id) => branch?.services.find((s) => s.id === id)?.name ?? id}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {insights ? (
          <section className="manager-section manager-tab-panel">
            <h2 className="manager-subtitle">Alerts, suggestions &amp; lane analytics</h2>
            <p className="muted small-print">
              No-shows today (UTC day): <strong>{insights.noShowsToday}</strong>
            </p>
            {insights.alerts.length === 0 ? (
              <p className="manager-alert-ok">No active alerts.</p>
            ) : (
              <ul className="manager-alerts">
                {insights.alerts.map((a) => (
                  <li key={a.message} className={`manager-alert manager-alert-${a.severity}`}>
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
            {(insights.suggestions ?? []).length > 0 ? (
              <>
                <h3 className="manager-h3">Suggested actions</h3>
                <ul className="manager-suggestions">
                  {(insights.suggestions ?? []).map((s) => (
                    <li key={`${s.kind}-${s.title}-${s.detail}`} className="manager-suggestion">
                      <strong>{s.title}</strong>
                      <span className="muted small-print"> {s.detail}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Waiting</th>
                    <th>Open counters*</th>
                    <th>ETA</th>
                    <th>Next window online / walk**</th>
                    <th>Avg serve (obs.)</th>
                    <th>Done today</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.lanes.map((L) => (
                    <tr key={L.serviceTypeId}>
                      <td>{L.serviceName}</td>
                      <td>{L.waitingCount}</td>
                      <td>{L.activeCountersForLane}</td>
                      <td>{L.estimatedWaitMinutes == null ? "—" : `${L.estimatedWaitMinutes} min`}</td>
                      <td>
                        {L.nextWindowOnlineCapacity == null || L.nextWindowSlotStartIso == null
                          ? "—"
                          : `${L.nextWindowOnlineCapacity} / ${L.nextWindowWalkCapacity ?? 0}`}
                        {L.nextWindowSlotStartIso ? (
                          <div className="muted small-print">{L.nextWindowSlotStartIso}</div>
                        ) : null}
                      </td>
                      <td>{L.avgServiceMinutesObserved}m</td>
                      <td>{L.completedToday}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small-print">
              *Counters that are <strong>Active</strong> and have that lane in their allowed set.
            </p>
            <p className="muted small-print">
              **Next service window after “now” in branch timezone — capacities reflect adaptive rules and current counter layout.
            </p>
          </section>
            ) : (
              <p className="muted small-print manager-tab-panel">Lane-level analytics will appear when the API returns data.</p>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
