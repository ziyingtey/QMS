import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { ManagerAnalyticsTab } from "../../manager/ManagerAnalyticsTab";
import { ManagerAppointmentsTab } from "../../manager/ManagerAppointmentsTab";
import { ManagerDashboardTab } from "../../manager/ManagerDashboardTab";
import { ManagerFloorTab } from "../../manager/ManagerFloorTab";
import { ManagerLiveQueueTab } from "../../manager/ManagerLiveQueueTab";
import { ManagerQueuesTab } from "../../manager/ManagerQueuesTab";
import { ManagerScheduleTab } from "../../manager/ManagerScheduleTab";
import { ManagerShell } from "../../manager/ManagerShell";
import { ManagerWalkInQrTab } from "../../manager/ManagerWalkInQrTab";
import { ALL_TABS, type ManagerTab } from "../../manager/managerNav";
import { MOCK_CLOSURES, MOCK_SETTINGS, MOCK_WALK_IN_LINK, previewScenario, type PreviewMock } from "../../preview/mockData";

/** Stable loader (module scope) so the QR tab does not refetch on every render. */
const loadMockWalkInLink = async () => MOCK_WALK_IN_LINK;

function tabFromSearch(tab: string | null): ManagerTab {
  return ALL_TABS.find((t) => t === tab) ?? "dashboard";
}

function mockFromSearch(mock: string | null): PreviewMock {
  return mock === "sparse" || mock === "empty" ? mock : "normal";
}

/** /preview/manager — the manager console on mock data. ?tab=<tab>, ?mock=sparse (quiet morning) or ?mock=empty (nothing yet). */
export function PreviewManagerPage() {
  const { toast } = useToast();
  const [search] = useSearchParams();
  const mock = mockFromSearch(search.get("mock"));
  const data = previewScenario(mock);

  const [managerTab, setManagerTab] = useState<ManagerTab>(() => tabFromSearch(search.get("tab")));
  const [expandedCounterId, setExpandedCounterId] = useState<string | null>(() => search.get("counter"));
  const [rows, setRows] = useState(data.counters);

  const [formSlot, setFormSlot] = useState(MOCK_SETTINGS.slotDurationMinutes);
  const [formWeekly, setFormWeekly] = useState(MOCK_SETTINGS.weeklyOperatingHours);
  const [formMaxSlotTotal, setFormMaxSlotTotal] = useState("");
  const [formEarlyCallMinutes, setFormEarlyCallMinutes] = useState(10);
  const [formCalledGraceMinutes, setFormCalledGraceMinutes] = useState(5);
  const [formNextWeekOpensDay, setFormNextWeekOpensDay] = useState(6);

  const branch = data.branches[0];
  const previewToast = (msg: string) => toast(`Preview: ${msg}`, "info");

  const setMode = (id: string, mode: "Active" | "Break" | "Closed") => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, mode } : r)));
    previewToast(`Counter set to ${mode}`);
  };
  const toggleLane = (id: string, laneId: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, allowedServiceTypeIds: checked ? [...new Set([...r.allowedServiceTypeIds, laneId])] : r.allowedServiceTypeIds.filter((x) => x !== laneId) }
          : r,
      ),
    );
    previewToast("Lanes updated");
  };
  const goToCounter = (counterId: string) => {
    setManagerTab("counters");
    setExpandedCounterId(counterId);
  };

  return (
    <ManagerShell
      tab={managerTab}
      onTabChange={setManagerTab}
      branches={data.branches}
      branchId={branch.id}
      branchOpen
      alertCount={data.insights.alerts.length}
      waitingCount={data.waiting.length}
      email="manager@local.test"
      onLogout={() => previewToast("Sign out is disabled")}
      liveStatus="live"
      banner={
        <div className="mds-preview-banner">
          UI preview · {mock} mock data · <Link to="/preview">Gallery</Link>
        </div>
      }
    >
      {managerTab === "dashboard" ? (
        <ManagerDashboardTab
          live={data.live}
          insights={data.insights}
          analytics={data.analytics}
          rows={rows}
          queues={data.queues}
          branch={branch}
          staffPickList={data.staff}
          branchOpenForOperations
          onGoToCounter={goToCounter}
          onGoToTab={setManagerTab}
          onSetMode={setMode}
          onAllowedLaneToggle={toggleLane}
        />
      ) : null}

      {managerTab === "queue" ? (
        <ManagerLiveQueueTab
          live={data.live}
          waiting={data.waiting}
          queues={data.queues}
          rows={rows}
          staffPickList={data.staff}
          onGoToCounter={goToCounter}
          onGoToTab={setManagerTab}
        />
      ) : null}

      {managerTab === "appointments" ? <ManagerAppointmentsTab data={data.appointments} onGoToTab={setManagerTab} /> : null}

      {managerTab === "queues" ? (
        <ManagerQueuesTab
          branch={branch}
          queues={data.queues}
          busy={false}
          onUpdate={async () => previewToast("Lane saved")}
          onSetServices={async () => previewToast("Service assignment saved")}
          onGoToTab={setManagerTab}
        />
      ) : null}

      {managerTab === "counters" ? (
        <ManagerFloorTab
          rows={rows}
          branch={branch}
          branchOpenForOperations
          staffPickList={data.staff}
          busy={false}
          expandedCounterId={expandedCounterId}
          onToggleExpand={(id) => setExpandedCounterId((p) => (p === id ? null : id))}
          onSetMode={setMode}
          onStaffChange={(id, staffId) => {
            const email = data.staff.find((s) => s.id === staffId)?.email ?? null;
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, assignedStaffEmail: email } : r)));
            previewToast("Teller updated");
          }}
          onAllowedLaneToggle={toggleLane}
          onDedicatedLaneChange={() => previewToast("Display lane updated")}
          onGoToTab={setManagerTab}
          staffIdForRow={(r) => data.staff.find((s) => s.email === r.assignedStaffEmail)?.id ?? ""}
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
          closures={mock === "empty" ? [] : MOCK_CLOSURES}
          onAddClosure={() => previewToast("Closure added")}
          onDeleteClosure={() => previewToast("Closure removed")}
        />
      ) : null}

      {managerTab === "analytics" ? <ManagerAnalyticsTab analytics={data.analytics} onGoToTab={setManagerTab} /> : null}

      {managerTab === "qr" ? (
        <ManagerWalkInQrTab
          branchId={branch.id}
          branchName={branch.name}
          live={data.live}
          loadLink={loadMockWalkInLink}
          onCopied={(ok) => previewToast(ok ? "Link copied" : "Copy blocked by the browser")}
          onGoToTab={setManagerTab}
        />
      ) : null}
    </ManagerShell>
  );
}
