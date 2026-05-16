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
  getStoredRole,
  getStoredToken,
  type AssignableStaffDto,
  type BranchDto,
  type BranchOperatingHourRow,
  type BranchOperationalSettings,
  type LiveDashboard,
  type ManagerCounterRowDto,
  type ManagerInsights,
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

export function ManagerCountersPage() {
  const navigate = useNavigate();
  const token = useMemo(() => getStoredToken(), []);
  const role = useMemo(() => getStoredRole(), []);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<ManagerCounterRowDto[]>([]);
  const [live, setLive] = useState<LiveDashboard | null>(null);
  const [settings, setSettings] = useState<BranchOperationalSettings | null>(null);
  const [insights, setInsights] = useState<ManagerInsights | null>(null);
  const [staffPickList, setStaffPickList] = useState<AssignableStaffDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [formOnline, setFormOnline] = useState(70);
  const [formSlot, setFormSlot] = useState(30);
  const [formWeekly, setFormWeekly] = useState<BranchOperatingHourRow[]>(defaultWeeklyHours);
  const [formAdaptiveCap, setFormAdaptiveCap] = useState(true);
  const [formMinSlotTotal, setFormMinSlotTotal] = useState("");
  const [formMaxSlotTotal, setFormMaxSlotTotal] = useState("");

  const branch = branches.find((b) => b.id === branchId);

  useEffect(() => {
    if (!token || role !== "Manager") {
      navigate("/login");
      return;
    }
    void (async () => {
      const b = await apiBranches();
      setBranches(b);
      if (b.length > 0) setBranchId(b[0].id);
    })();
    void (async () => {
      try {
        setStaffPickList(await apiManagerAssignableStaff(token));
      } catch {
        setStaffPickList([]);
      }
    })();
  }, [navigate, token, role]);

  const load = useCallback(async () => {
    if (!token || !branchId) return;
    setBusy(true);
    try {
      const list = await apiManagerCounters(token, branchId);
      setRows(list);
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [token, branchId]);

  const loadSettings = useCallback(async () => {
    if (!token || !branchId) return;
    try {
      const s = await apiManagerOperationalSettings(token, branchId);
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
    } catch {
      setSettings(null);
    }
  }, [token, branchId]);

  const loadInsights = useCallback(async () => {
    if (!token || !branchId) return;
    try {
      setInsights(await apiManagerInsights(token, branchId));
    } catch {
      setInsights(null);
    }
  }, [token, branchId]);

  const refreshLive = useCallback(async () => {
    if (!token || !branchId) return;
    try {
      setLive(await apiLiveDashboard(token, branchId));
    } catch {
      setLive(null);
    }
  }, [token, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshLive();
    void loadSettings();
    void loadInsights();
  }, [refreshLive, loadSettings, loadInsights]);

  useEffect(() => {
    if (!token || !branchId) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue?access_token=${encodeURIComponent(token)}`)
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
  }, [token, branchId, load, refreshLive, loadInsights, loadSettings]);

  useEffect(() => {
    if (!token || !branchId) return;
    const id = setInterval(() => {
      void refreshLive();
      void loadInsights();
      void load();
    }, 12_000);
    return () => clearInterval(id);
  }, [token, branchId, refreshLive, loadInsights, load]);

  const setMode = async (counterId: string, mode: "Active" | "Break" | "Closed") => {
    if (!token || !branchId) return;
    setBusy(true);
    try {
      await apiManagerSetCounterMode(token, branchId, counterId, mode);
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
    if (!token || !branchId) return;
    const row = rows.find((r) => r.id === counterId);
    if (!row) return;
    const next = new Set(row.allowedServiceTypeIds);
    if (checked) next.add(laneId);
    else next.delete(laneId);
    setBusy(true);
    try {
      await apiManagerSetAllowedServices(token, branchId, counterId, [...next]);
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
    if (!token || !branchId) return;
    setBusy(true);
    try {
      await apiManagerSetCounterStaff(token, branchId, counterId, value === "" ? null : value);
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
    if (!token || !branchId) return;
    setBusy(true);
    try {
      await apiManagerSetDedicatedLane(token, branchId, counterId, serviceTypeId === "" ? null : serviceTypeId);
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
    if (!token || !branchId) return;
    setBusy(true);
    setMessage(null);
    try {
      const minRaw = formMinSlotTotal.trim();
      const maxRaw = formMaxSlotTotal.trim();
      const s = await apiManagerPatchOperationalSettings(token, branchId, {
        onlineQuotaPercent: formOnline,
        slotDurationMinutes: formSlot,
        weeklyOperatingHours: formWeekly,
        adaptiveSlotCapacityEnabled: formAdaptiveCap,
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

  return (
    <div className="deck-page">
      <header className="deck-topbar">
        <div className="brand-inline">
          <span className="brand-mark" />
          <span className="brand-text">IH-QMS</span>
        </div>
        <div className="topbar-actions">
          <span className="live-pill" title="SignalR live updates + 12s backup refresh (dashboard, insights, counters)">
            <span className="live-dot" /> Live
          </span>
          <Link to="/" className="link-muted">
            Counter workspace
          </Link>
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </header>

      <main className="manager-main">
        <h1 className="section-title">Branch manager · operations &amp; crowd control</h1>

        <section className="manager-flow-card">
          <h2 className="manager-subtitle">How the system links (real-time)</h2>
          <ol className="manager-flow-list">
            <li>
              <strong>Customer</strong> picks a <strong>branch</strong> and a <strong>service type</strong> (lane). Their ticket is stored on that lane’s queue.
            </li>
            <li>
              <strong>Call next</strong> only pulls from that lane. A counter counts toward a lane if it is <strong>General</strong> (no lanes checked — serves every lane) or its <strong>allowed lanes</strong> include that service type.
            </li>
            <li>
              <strong>Capacity</strong> (slots, online vs walk-in split) uses <strong>active</strong> counters that can serve the lane — so opening/closing counters or changing allowed lanes immediately changes crowding and ETAs (SignalR pushes updates).
            </li>
            <li>
              <strong>Adaptive slot capacity</strong> (when enabled): manager alerts compare the next booking window’s live seat count (from counters) to active bookings so you see pressure before the grid fills.
            </li>
          </ol>
        </section>

        <label className="select-row">
          Branch
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {message ? <p className="error">{message}</p> : null}

        {live ? (
          <div className="manager-kpi-strip">
            <div className="manager-kpi-chip">
              <span className="manager-kpi-label">In queue</span>
              <span className="manager-kpi-val">{live.queueLength}</span>
            </div>
            <div className="manager-kpi-chip">
              <span className="manager-kpi-label">Avg wait</span>
              <span className="manager-kpi-val">{live.avgWaitMinutes}m</span>
            </div>
            <div className="manager-kpi-chip">
              <span className="manager-kpi-label">Active counters</span>
              <span className="manager-kpi-val">{live.activeCounters}</span>
            </div>
            <div className="manager-kpi-chip">
              <span className="manager-kpi-label">In branch</span>
              <span className="manager-kpi-val">{live.customersInBranch}</span>
            </div>
            <div className="manager-kpi-chip">
              <span className="manager-kpi-label">Priority (checked-in)</span>
              <span className="manager-kpi-val">{live.priorityWaiting}</span>
            </div>
            <div className="manager-kpi-chip">
              <span className="manager-kpi-label">Served today</span>
              <span className="manager-kpi-val">{live.customersServedToday}</span>
            </div>
          </div>
        ) : null}

        {live && live.byService.length > 0 ? (
          <section className="manager-section">
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

        <section className="manager-section">
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

        {insights ? (
          <section className="manager-section">
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
              *Counters that are <strong>Active</strong> and either <strong>General</strong> (no allowed lanes) or have that lane in their allowed set.
            </p>
            <p className="muted small-print">
              **Next service window after “now” in branch timezone — capacities reflect adaptive rules and current counter layout.
            </p>
          </section>
        ) : null}

        <section className="manager-section">
          <h2 className="manager-subtitle">Counter management · allowed lanes &amp; staff</h2>
          <div className="manager-table-wrap">
            <table className="manager-table manager-table-tall">
                <thead>
                <tr>
                  <th>#</th>
                  <th>Allowed lanes</th>
                  <th>Primary lane (counter display)</th>
                  <th>Staff</th>
                  <th>Status</th>
                  <th>Open / break / closed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.number}</td>
                    <td>
                      <p className="muted small-print manager-lane-summary" title={r.allowedLanesDisplay}>
                        {r.allowedServiceTypeIds.length === 0 ? (
                          <strong>General</strong>
                        ) : (
                          <>
                            <strong>Limited:</strong> {r.allowedLanesDisplay}
                          </>
                        )}
                      </p>
                      <div className="manager-lane-picks">
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
                    </td>
                    <td>
                      <select
                        className="manager-select"
                        value={r.currentDedicatedServiceTypeId ?? ""}
                        disabled={busy}
                        onChange={(e) => void onDedicatedLaneChange(r.id, e.target.value)}
                      >
                        <option value="">— None —</option>
                        {(branch?.services ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {r.currentDedicatedLaneName ? (
                        <p className="muted small-print">Now: {r.currentDedicatedLaneName}</p>
                      ) : null}
                    </td>
                    <td>
                      <select
                        className="manager-select"
                        value={staffIdForRow(r)}
                        disabled={busy}
                        onChange={(e) => void onStaffChange(r.id, e.target.value)}
                      >
                        <option value="">— Unassigned —</option>
                        {staffPickList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.email})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`mode-pill mode-${r.mode.toLowerCase()}`}>{r.mode}</span>
                    </td>
                    <td className="manager-actions">
                      <button type="button" className="btn-sm btn-open" disabled={busy} onClick={() => void setMode(r.id, "Active")}>
                        Open
                      </button>
                      <button type="button" className="btn-sm btn-break" disabled={busy} onClick={() => void setMode(r.id, "Break")}>
                        Break
                      </button>
                      <button type="button" className="btn-sm btn-close" disabled={busy} onClick={() => void setMode(r.id, "Closed")}>
                        Closed
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
