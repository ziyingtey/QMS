import * as signalR from "@microsoft/signalr";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiBranches,
  apiLiveDashboard,
  apiManagerAnalyticsToday,
  apiManagerAssignableStaff,
  apiManagerCounters,
  apiManagerInsights,
  apiManagerOperationalSettings,
  apiManagerPatchOperationalSettings,
  apiManagerSetAllowedServices,
  apiManagerSetCounterMode,
  apiManagerSetCounterStaff,
  apiManagerSetDedicatedLane,
  getStoredBranchId,
  getStoredEmail,
  getStoredRole,
  getStoredToken,
  getValidStaffAccessToken,
  setStoredBranchId,
  subscribeStaffSession,
  type AssignableStaffDto,
  type BranchDto,
  type BranchOperatingHourRow,
  type BranchOperationalSettings,
  type BranchAnalyticsToday,
  type LiveDashboard,
  type ManagerCounterRowDto,
  type ManagerInsights,
} from "../api";
import { AppTopBar } from "../components/AppTopBar";
import { useToast } from "../context/ToastContext";
import { API_BASE } from "../config";
import { useStaffLogout } from "../hooks/useStaffLogout";
import { isBranchOpenForOperations } from "../manager/branchOpenStatus";
import { buildAnalyticsFallback } from "../manager/managerAnalyticsFallback";
import { ManagerAnalyticsTab } from "../manager/ManagerAnalyticsTab";
import { ManagerDashboardTab } from "../manager/ManagerDashboardTab";
import { ManagerFloorTab } from "../manager/ManagerFloorTab";
import { ManagerScheduleTab } from "../manager/ManagerScheduleTab";
import { ManagerSidebar, type ManagerTab } from "../manager/ManagerSidebar";
import { defaultWeeklyHours } from "../manager/managerUtils";

export function ManagerCountersPage() {
  const navigate = useNavigate();
  const logout = useStaffLogout();
  const { toast } = useToast();
  const [hubToken, setHubToken] = useState<string | null>(() => getStoredToken());
  const [email, setEmail] = useState(() => getStoredEmail());

  useEffect(() => {
    return subscribeStaffSession(() => {
      setHubToken(getStoredToken());
      setEmail(getStoredEmail());
    });
  }, []);

  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState(() => getStoredBranchId() ?? "");
  const [rows, setRows] = useState<ManagerCounterRowDto[]>([]);
  const [live, setLive] = useState<LiveDashboard | null>(null);
  const [settings, setSettings] = useState<BranchOperationalSettings | null>(null);
  const [insights, setInsights] = useState<ManagerInsights | null>(null);
  const [analytics, setAnalytics] = useState<BranchAnalyticsToday | null>(null);
  const [analyticsSource, setAnalyticsSource] = useState<"api" | "fallback" | null>(null);
  const [staffPickList, setStaffPickList] = useState<AssignableStaffDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [managerTab, setManagerTab] = useState<ManagerTab>("dashboard");
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
  const branchOpenForOperations = isBranchOpenForOperations(branch, settings);
  const alertCount = insights?.alerts.length ?? 0;

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

  const onBranchChange = (id: string) => {
    setBranchId(id);
    setStoredBranchId(id);
  };

  useEffect(() => {
    if (!branchId) return;
    void apiManagerAssignableStaff(branchId)
      .then(setStaffPickList)
      .catch(() => setStaffPickList([]));
  }, [branchId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setRows(await apiManagerCounters(branchId));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  }, [branchId, toast]);

  const loadSettings = useCallback(async () => {
    if (!branchId) return;
    try {
      const s = await apiManagerOperationalSettings(branchId);
      setSettings(s);
      setFormOnline(s.onlineQuotaPercent);
      setFormSlot(s.slotDurationMinutes);
      const w = s.weeklyOperatingHours;
      setFormWeekly(w && w.length === 7 ? w.map((r) => ({ ...r })) : defaultWeeklyHours());
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

  const loadAnalytics = useCallback(async () => {
    if (!branchId) return;
    try {
      setAnalytics(await apiManagerAnalyticsToday(branchId));
      setAnalyticsSource("api");
    } catch {
      setAnalyticsSource("fallback");
    }
  }, [branchId]);

  useEffect(() => {
    if (analyticsSource !== "fallback") return;
    const fb = buildAnalyticsFallback(live, insights);
    if (fb) setAnalytics(fb);
  }, [analyticsSource, live, insights]);

  useEffect(() => {
    setAnalytics(null);
    setAnalyticsSource(null);
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
    void loadAnalytics();
  }, [refreshLive, loadSettings, loadInsights, loadAnalytics]);

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
      void loadAnalytics();
    };

    conn.on("QueueUpdated", bump);
    conn.on("CountersUpdated", bump);
    conn.on("TicketCalled", () => {
      void refreshLive();
      void loadInsights();
    });

    const watch = () => void conn.invoke("WatchBranch", branchId).catch(() => {});

    void conn.start().then(watch).catch(() => toast("Live updates disconnected.", "error"));
    conn.onreconnected(() => {
      watch();
      bump();
    });

    return () => {
      void conn.stop();
    };
  }, [hubToken, branchId, load, refreshLive, loadInsights, loadSettings, loadAnalytics, toast]);

  useEffect(() => {
    if (!branchId) return;
    const id = setInterval(() => {
      void refreshLive();
      void loadInsights();
      void loadAnalytics();
    }, 12_000);
    return () => clearInterval(id);
  }, [branchId, refreshLive, loadInsights, load, loadAnalytics]);

  const setMode = async (counterId: string, mode: "Active" | "Break" | "Closed") => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerSetCounterMode(branchId, counterId, mode);
      toast(`Counter set to ${mode}`, "success");
      await load();
      await refreshLive();
      await loadInsights();
      await loadAnalytics();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
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
      toast("Keep at least one lane, or close the counter.", "error");
      return;
    }
    setBusy(true);
    try {
      await apiManagerSetAllowedServices(branchId, counterId, [...next]);
      await load();
      await refreshLive();
      await loadInsights();
      await loadAnalytics();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const onStaffChange = async (counterId: string, value: string) => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerSetCounterStaff(branchId, counterId, value === "" ? null : value);
      toast("Teller assignment updated", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
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
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveCapacity = async () => {
    if (!branchId) return;
    setBusy(true);
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
      toast("Schedule and capacity saved", "success");
      await loadInsights();
      await loadAnalytics();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const staffIdForRow = (r: ManagerCounterRowDto): string => {
    if (!r.assignedStaffEmail) return "";
    return staffPickList.find((s) => s.email === r.assignedStaffEmail)?.id ?? "";
  };

  const goToCounter = (counterId: string) => {
    setManagerTab("counters");
    setExpandedCounterId(counterId);
    window.setTimeout(() => {
      document.getElementById(`counter-${counterId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const branchSelect = (
    <label className="qgo-branch-select">
      <span className="qgo-muted">Branch</span>
      <select value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="qgo-shell qgo-shell--manager">
      <AppTopBar variant="manager" email={email} role="Manager" onLogout={logout} extra={branchSelect} />

      <div className="qgo-mgr-layout">
        <ManagerSidebar
          active={managerTab}
          onChange={setManagerTab}
          branchName={branch?.name}
          branchOpen={branchOpenForOperations}
          alertCount={alertCount}
        />

        <main className="qgo-mgr-content">
          {managerTab === "dashboard" ? (
            <ManagerDashboardTab
              live={live}
              insights={insights}
              rows={rows}
              branch={branch}
              staffPickList={staffPickList}
              branchOpenForOperations={branchOpenForOperations}
              onGoToCounter={goToCounter}
              onGoToCounters={() => setManagerTab("counters")}
            />
          ) : null}

          {managerTab === "counters" ? (
            <ManagerFloorTab
              rows={rows}
              branch={branch}
              branchOpenForOperations={branchOpenForOperations}
              staffPickList={staffPickList}
              busy={busy}
              expandedCounterId={expandedCounterId}
              onToggleExpand={(id) => setExpandedCounterId((prev) => (prev === id ? null : id))}
              onSetMode={setMode}
              onStaffChange={onStaffChange}
              onAllowedLaneToggle={onAllowedLaneToggle}
              onDedicatedLaneChange={onDedicatedLaneChange}
              staffIdForRow={staffIdForRow}
            />
          ) : null}

          {managerTab === "capacity" ? (
            <ManagerScheduleTab
              settings={settings}
              busy={busy}
              formOnline={formOnline}
              setFormOnline={setFormOnline}
              formSlot={formSlot}
              setFormSlot={setFormSlot}
              formWeekly={formWeekly}
              setFormWeekly={setFormWeekly}
              formAdaptiveCap={formAdaptiveCap}
              setFormAdaptiveCap={setFormAdaptiveCap}
              formMinSlotTotal={formMinSlotTotal}
              setFormMinSlotTotal={setFormMinSlotTotal}
              formMaxSlotTotal={formMaxSlotTotal}
              setFormMaxSlotTotal={setFormMaxSlotTotal}
              formEarlyCallMinutes={formEarlyCallMinutes}
              setFormEarlyCallMinutes={setFormEarlyCallMinutes}
              formCalledGraceMinutes={formCalledGraceMinutes}
              setFormCalledGraceMinutes={setFormCalledGraceMinutes}
              onSave={saveCapacity}
            />
          ) : null}

          {managerTab === "analytics" ? (
            <ManagerAnalyticsTab analytics={analytics} analyticsSource={analyticsSource} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
