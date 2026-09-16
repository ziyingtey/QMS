import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppTopBar } from "../../components/AppTopBar";
import { useToast } from "../../context/ToastContext";
import { ManagerAnalyticsTab } from "../../manager/ManagerAnalyticsTab";
import { ManagerDashboardTab } from "../../manager/ManagerDashboardTab";
import { ManagerFloorTab } from "../../manager/ManagerFloorTab";
import { ManagerScheduleTab } from "../../manager/ManagerScheduleTab";
import { ManagerSidebar, type ManagerTab } from "../../manager/ManagerSidebar";
import {
  MOCK_ANALYTICS,
  MOCK_BRANCHES,
  MOCK_COUNTERS,
  MOCK_INSIGHTS,
  MOCK_LIVE,
  MOCK_SETTINGS,
  MOCK_STAFF,
} from "../../preview/mockData";

function tabFromSearch(tab: string | null): ManagerTab {
  if (tab === "counters" || tab === "capacity" || tab === "analytics" || tab === "dashboard" || tab === "queue" || tab === "appointments") return tab;
  return "analytics";
}

export function PreviewManagerPage() {
  const { toast } = useToast();
  const [search] = useSearchParams();
  const [managerTab, setManagerTab] = useState<ManagerTab>(() => tabFromSearch(search.get("tab")));
  const [expandedCounterId, setExpandedCounterId] = useState<string | null>(null);
  const [rows, setRows] = useState(MOCK_COUNTERS);

  const [formSlot, setFormSlot] = useState(MOCK_SETTINGS.slotDurationMinutes);
  const [formWeekly, setFormWeekly] = useState(MOCK_SETTINGS.weeklyOperatingHours);
  const [formMaxSlotTotal, setFormMaxSlotTotal] = useState("");
  const [formEarlyCallMinutes, setFormEarlyCallMinutes] = useState(10);
  const [formCalledGraceMinutes, setFormCalledGraceMinutes] = useState(5);
  const [formNextWeekOpensDay, setFormNextWeekOpensDay] = useState(6);

  const branch = MOCK_BRANCHES[0];
  const live = MOCK_LIVE;
  const insights = MOCK_INSIGHTS;
  const analytics = MOCK_ANALYTICS;
  const alertCount = insights.alerts.length;

  const noopLogout = () => toast("Preview mode", "info");
  const previewToast = (msg: string) => toast(`Preview: ${msg}`, "info");

  const goToCounter = (counterId: string) => {
    setManagerTab("counters");
    setExpandedCounterId(counterId);
    previewToast("Jumped to counter");
  };

  const branchSelect = (
    <label className="qgo-branch-select">
      <span className="qgo-muted">Branch</span>
      <select defaultValue={branch.id}>
        <option value={branch.id}>{branch.name}</option>
      </select>
    </label>
  );

  return (
    <div className="qgo-shell qgo-shell--manager">
      <div className="qgo-preview-banner qgo-preview-banner--dark">
        UI Preview · mock data · <Link to="/preview">Gallery</Link>
      </div>
      <AppTopBar variant="manager" email="manager@local.test" role="Manager" onLogout={noopLogout} extra={branchSelect} />

      <div className="qgo-mgr-layout">
        <ManagerSidebar
          active={managerTab}
          onChange={setManagerTab}
          branchName={branch.name}
          branchOpen
          alertCount={alertCount}
        />

        <main className="qgo-mgr-content">
          {managerTab === "dashboard" ? (
            <ManagerDashboardTab
              live={live}
              insights={insights}
              rows={rows}
              branch={branch}
              staffPickList={MOCK_STAFF}
              branchOpenForOperations
              onGoToCounter={goToCounter}
              onGoToCounters={() => setManagerTab("counters")}
            />
          ) : null}

          {managerTab === "counters" ? (
            <ManagerFloorTab
              rows={rows}
              branch={branch}
              branchOpenForOperations
              staffPickList={MOCK_STAFF}
              busy={false}
              expandedCounterId={expandedCounterId}
              onToggleExpand={(id) => setExpandedCounterId((p) => (p === id ? null : id))}
              onSetMode={(id, mode) => {
                setRows((prev) => prev.map((r) => (r.id === id ? { ...r, mode } : r)));
                previewToast(`Counter ${mode}`);
              }}
              onStaffChange={() => previewToast("Staff updated")}
              onAllowedLaneToggle={() => previewToast("Lanes updated")}
              onDedicatedLaneChange={() => previewToast("Display lane updated")}
              staffIdForRow={(r) => MOCK_STAFF.find((s) => s.email === r.assignedStaffEmail)?.id ?? ""}
            />
          ) : null}

          {managerTab === "capacity" ? (
            <ManagerScheduleTab
              settings={MOCK_SETTINGS}
              branch={branch}
              busy={false}
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
              onSave={() => toast("Preview: settings saved", "success")}
              serviceOnlineSlots={{}}
              onServiceOnlineSlotsChange={() => previewToast("Online quota updated")}
              closures={[]}
              onAddClosure={() => previewToast("Closure added")}
              onDeleteClosure={() => previewToast("Closure removed")}
            />
          ) : null}

          {managerTab === "analytics" ? (
            <ManagerAnalyticsTab analytics={analytics} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
