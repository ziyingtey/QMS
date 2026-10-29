import * as signalR from "@microsoft/signalr";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiBranches,
  apiLiveDashboard,
  apiManagerAnalyticsToday,
  apiManagerAppointmentsToday,
  apiManagerAssignableStaff,
  apiManagerClosures,
  apiManagerCounters,
  apiManagerCreateClosure,
  apiManagerDeleteClosure,
  apiManagerInsights,
  apiManagerOperationalSettings,
  apiManagerPatchOperationalSettings,
  apiManagerPatchServiceOnlineSlots,
  apiManagerSetAllowedServices,
  apiManagerSetCounterMode,
  apiManagerSetCounterStaff,
  apiManagerSetDedicatedLane,
  apiManagerQueues,
  apiManagerSetQueueServices,
  apiManagerUpdateQueue,
  apiManagerWaitingQueue,
  getStoredBranchId,
  getStoredEmail,
  getStoredRole,
  getStoredToken,
  getValidStaffAccessToken,
  setStoredBranchId,
  subscribeStaffSession,
  type AssignableStaffDto,
  type BranchClosure,
  type BranchDto,
  type BranchOperatingHourRow,
  type BranchOperationalSettings,
  type BranchAnalyticsToday,
  type LiveDashboard,
  type ManagerAppointmentsToday,
  type ManagerCounterRowDto,
  type ManagerInsights,
  type BranchQueueDto,
  type ManagerWaitingTicket,
} from "../api";
import type { LiveStatus } from "../components/AppTopBar";
import { useToast } from "../context/ToastContext";
import { API_BASE } from "../config";
import { useStaffLogout } from "../hooks/useStaffLogout";
import { isBranchOpenForOperations } from "../manager/branchOpenStatus";
import { buildAnalyticsFallback } from "../manager/managerAnalyticsFallback";
import { ManagerAnalyticsTab } from "../manager/ManagerAnalyticsTab";
import { ManagerAppointmentsTab } from "../manager/ManagerAppointmentsTab";
import { ManagerDashboardTab } from "../manager/ManagerDashboardTab";
import { ManagerFloorTab } from "../manager/ManagerFloorTab";
import { ManagerLiveQueueTab } from "../manager/ManagerLiveQueueTab";
import { ManagerQueuesTab } from "../manager/ManagerQueuesTab";
import { ManagerScheduleTab } from "../manager/ManagerScheduleTab";
import { ManagerShell } from "../manager/ManagerShell";
import { ManagerWalkInQrTab } from "../manager/ManagerWalkInQrTab";
import type { ManagerTab } from "../manager/managerNav";
import { apiWalkInLink } from "../walkInApi";
import { defaultWeeklyHours } from "../manager/managerUtils";
import { malaysiaDayEndIso, malaysiaDayStartIso } from "../malaysiaTime";

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
  const [waiting, setWaiting] = useState<ManagerWaitingTicket[]>([]);
  const [queues, setQueues] = useState<BranchQueueDto[]>([]);
  const [appointments, setAppointments] = useState<ManagerAppointmentsToday | null>(null);
  const [closures, setClosures] = useState<BranchClosure[]>([]);
  const [serviceOnlineSlots, setServiceOnlineSlots] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [managerTab, setManagerTab] = useState<ManagerTab>("dashboard");
  const [expandedCounterId, setExpandedCounterId] = useState<string | null>(null);
  /** UI-only: SignalR connection state for the top-bar Live badge. */
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");

  const [formSlot, setFormSlot] = useState(30);
  const [formWeekly, setFormWeekly] = useState<BranchOperatingHourRow[]>(defaultWeeklyHours);
  const [formMaxSlotTotal, setFormMaxSlotTotal] = useState("");
  const [formEarlyCallMinutes, setFormEarlyCallMinutes] = useState(10);
  const [formCalledGraceMinutes, setFormCalledGraceMinutes] = useState(5);
  const [formNextWeekOpensDay, setFormNextWeekOpensDay] = useState(6);

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
      setFormSlot(s.slotDurationMinutes);
      const w = s.weeklyOperatingHours;
      setFormWeekly(w && w.length === 7 ? w.map((r) => ({ ...r })) : defaultWeeklyHours());
      setFormMaxSlotTotal(s.maxSlotTotalCapacity != null ? String(s.maxSlotTotalCapacity) : "");
      setFormEarlyCallMinutes(s.onlineEarlyCallMinutes ?? 10);
      setFormCalledGraceMinutes(s.calledAbsentGraceMinutes ?? 5);
      setFormNextWeekOpensDay(s.nextWeekBookingOpensOnDay ?? 6);
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

  const loadWaiting = useCallback(async () => {
    if (!branchId) return;
    try {
      setWaiting(await apiManagerWaitingQueue(branchId));
      setQueues(await apiManagerQueues(branchId));
    } catch {
      setWaiting([]);
      setQueues([]);
    }
  }, [branchId]);


  const onUpdateQueue = useCallback(
    async (
      queueId: string,
      patch: { name?: string; ticketPrefix?: string; serviceLevelMinutes?: number; isActive?: boolean },
    ) => {
      if (!branchId) return;
      setBusy(true);
      try {
        await apiManagerUpdateQueue(branchId, queueId, patch);
        toast("Queue saved", "success");
        await loadWaiting();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setBusy(false);
      }
    },
    [branchId, loadWaiting, toast],
  );

  const onSetQueueServices = useCallback(
    async (queueId: string, serviceTypeIds: string[]) => {
      if (!branchId) return;
      setBusy(true);
      try {
        await apiManagerSetQueueServices(branchId, queueId, serviceTypeIds);
        toast("Service assignment saved", "success");
        await loadWaiting();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setBusy(false);
      }
    },
    [branchId, loadWaiting, toast],
  );

  const loadAppointments = useCallback(async () => {
    if (!branchId) return;
    try {
      setAppointments(await apiManagerAppointmentsToday(branchId));
    } catch {
      setAppointments(null);
    }
  }, [branchId]);

  const loadClosures = useCallback(async () => {
    if (!branchId) return;
    try {
      setClosures(await apiManagerClosures(branchId));
    } catch {
      setClosures([]);
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

  // Init service online slots from branch data
  useEffect(() => {
    if (!branch) return;
    const slots: Record<string, number> = {};
    for (const s of branch.services) {
      slots[s.id] = serviceOnlineSlots[s.id] ?? 4;
    }
    setServiceOnlineSlots(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id]);

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
    void loadWaiting();
    void loadAppointments();
    void loadClosures();
  }, [refreshLive, loadSettings, loadInsights, loadAnalytics, loadWaiting, loadAppointments, loadClosures]);

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
      void loadWaiting();
      void loadAppointments();
    };

    conn.on("QueueUpdated", bump);
    conn.on("CountersUpdated", bump);
    conn.on("TicketCalled", () => {
      void refreshLive();
      void loadInsights();
      void loadWaiting();
    });

    const watch = () => void conn.invoke("WatchBranch", branchId).catch(() => {});
    let disposed = false;
    const showStatus = (st: LiveStatus) => {
      if (!disposed) setLiveStatus(st);
    };

    void conn
      .start()
      .then(() => {
        showStatus("live");
        watch();
      })
      .catch(() => {
        showStatus("offline");
        toast("Live updates disconnected.", "error");
      });
    conn.onreconnecting(() => showStatus("connecting"));
    conn.onclose(() => showStatus("offline"));
    conn.onreconnected(() => {
      showStatus("live");
      watch();
      bump();
    });

    return () => {
      disposed = true;
      void conn.stop();
    };
  }, [hubToken, branchId, load, refreshLive, loadInsights, loadSettings, loadAnalytics, loadWaiting, loadAppointments, toast]);

  useEffect(() => {
    if (!branchId) return;
    const id = setInterval(() => {
      void refreshLive();
      void loadInsights();
      void loadAnalytics();
      void loadWaiting();
      void loadAppointments();
    }, 12_000);
    return () => clearInterval(id);
  }, [branchId, refreshLive, loadInsights, load, loadAnalytics, loadWaiting, loadAppointments]);

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
      const maxRaw = formMaxSlotTotal.trim();
      const s = await apiManagerPatchOperationalSettings(branchId, {
        slotDurationMinutes: formSlot,
        weeklyOperatingHours: formWeekly,
        onlineEarlyCallMinutes: formEarlyCallMinutes,
        calledAbsentGraceMinutes: formCalledGraceMinutes,
        nextWeekBookingOpensOnDay: formNextWeekOpensDay,
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

  const onServiceOnlineSlotsChange = async (serviceId: string, value: number) => {
    if (!branchId) return;
    setServiceOnlineSlots((prev) => ({ ...prev, [serviceId]: value }));
    try {
      await apiManagerPatchServiceOnlineSlots(branchId, serviceId, value);
      toast("Online quota updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onAddClosure = async (from: string, to: string, reason: string) => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerCreateClosure(branchId, {
        // Date inputs are Malaysia calendar dates; the closure covers both days in full.
        closedFrom: malaysiaDayStartIso(from),
        closedTo: malaysiaDayEndIso(to),
        reason: reason || undefined,
      });
      toast("Closure added", "success");
      await loadClosures();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteClosure = async (id: string) => {
    if (!branchId) return;
    setBusy(true);
    try {
      await apiManagerDeleteClosure(branchId, id);
      toast("Closure removed", "success");
      await loadClosures();
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

  return (
    <ManagerShell
      tab={managerTab}
      onTabChange={setManagerTab}
      branches={branches}
      branchId={branchId}
      onBranchChange={onBranchChange}
      branchOpen={branchOpenForOperations}
      alertCount={alertCount}
      waitingCount={waiting.length}
      email={email}
      onLogout={logout}
      liveStatus={liveStatus}
    >
      {managerTab === "dashboard" ? (
        <ManagerDashboardTab
          live={live}
          insights={insights}
          analytics={analytics}
          rows={rows}
          queues={queues}
          branch={branch}
          staffPickList={staffPickList}
          branchOpenForOperations={branchOpenForOperations}
          busy={busy}
          onGoToCounter={goToCounter}
          onGoToTab={setManagerTab}
          onSetMode={setMode}
          onAllowedLaneToggle={onAllowedLaneToggle}
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
          onGoToTab={setManagerTab}
        />
      ) : null}

      {managerTab === "queue" ? (
        <ManagerLiveQueueTab
          live={live}
          waiting={waiting}
          queues={queues}
          rows={rows}
          staffPickList={staffPickList}
          onGoToCounter={goToCounter}
          onGoToTab={setManagerTab}
        />
      ) : null}

      {managerTab === "queues" ? (
        <ManagerQueuesTab branch={branch} queues={queues} busy={busy} onUpdate={onUpdateQueue} onSetServices={onSetQueueServices} onGoToTab={setManagerTab} />
      ) : null}

      {managerTab === "appointments" ? <ManagerAppointmentsTab data={appointments} onGoToTab={setManagerTab} /> : null}

      {managerTab === "capacity" ? (
        <ManagerScheduleTab
          settings={settings}
          branch={branch}
          busy={busy}
          formSlot={formSlot}
          setFormSlot={setFormSlot}
          formWeekly={formWeekly}
          setFormWeekly={setFormWeekly}
          formMaxSlotTotal={formMaxSlotTotal}
          setFormMaxSlotTotal={setFormMaxSlotTotal}
          formEarlyCallMinutes={formEarlyCallMinutes}
          setFormEarlyCallMinutes={setFormEarlyCallMinutes}
          formCalledGraceMinutes={formCalledGraceMinutes}
          setFormCalledGraceMinutes={setFormCalledGraceMinutes}
          formNextWeekOpensDay={formNextWeekOpensDay}
          setFormNextWeekOpensDay={setFormNextWeekOpensDay}
          onSave={saveCapacity}
          serviceOnlineSlots={serviceOnlineSlots}
          onServiceOnlineSlotsChange={onServiceOnlineSlotsChange}
          closures={closures}
          onAddClosure={onAddClosure}
          onDeleteClosure={onDeleteClosure}
        />
      ) : null}

      {managerTab === "analytics" ? <ManagerAnalyticsTab analytics={analytics} analyticsSource={analyticsSource} onGoToTab={setManagerTab} /> : null}

      {managerTab === "qr" ? (
        <ManagerWalkInQrTab
          branchId={branchId}
          branchName={branch?.name}
          live={live}
          loadLink={apiWalkInLink}
          onCopied={(ok) => toast(ok ? "Link copied" : "Could not copy the link", ok ? "success" : "error")}
          onGoToTab={setManagerTab}
        />
      ) : null}
    </ManagerShell>
  );
}
