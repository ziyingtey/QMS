import { useState } from "react";
import { AlertTriangle, Check, Coffee, Info, Layers, Monitor, Settings2, UserX, Power } from "lucide-react";
import type { AssignableStaffDto, BranchDto, ManagerCounterRowDto } from "../api";
import { Badge, Card, Chips, Drawer, EmptyBlock, PageHeader, Segmented, StatCard, type SegOption } from "./ui";
import { counterModeMeta } from "./uiTones";
import { counterStats } from "./managerUtils";
import type { ManagerTab } from "./managerNav";

type Mode = "Active" | "Break" | "Closed";

type Props = {
  rows: ManagerCounterRowDto[];
  branch: BranchDto | undefined;
  branchOpenForOperations?: boolean;
  staffPickList: AssignableStaffDto[];
  busy: boolean;
  /** Counter whose configuration drawer is open (set from Dashboard / Live Monitor). */
  expandedCounterId: string | null;
  onToggleExpand: (id: string) => void;
  onSetMode: (counterId: string, mode: Mode) => void;
  onStaffChange: (counterId: string, value: string) => void;
  onAllowedLaneToggle: (counterId: string, laneId: string, checked: boolean) => void;
  onDedicatedLaneChange: (counterId: string, serviceTypeId: string) => void;
  staffIdForRow: (r: ManagerCounterRowDto) => string;
  onGoToTab?: (tab: ManagerTab) => void;
};

type Filter = "all" | "active" | "break" | "closed";

const MODE_VALUE: Record<"active" | "break" | "closed", Mode> = { active: "Active", break: "Break", closed: "Closed" };

/** Counters: "Is every counter staffed and set up?" Status and teller are edited inline; lanes in a drawer. */
export function ManagerFloorTab({
  rows,
  branch,
  branchOpenForOperations = true,
  staffPickList,
  busy,
  expandedCounterId,
  onToggleExpand,
  onSetMode,
  onStaffChange,
  onAllowedLaneToggle,
  onDedicatedLaneChange,
  staffIdForRow,
  onGoToTab,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const stats = counterStats(rows);
  const services = branch?.services ?? [];
  const unassigned = rows.filter((r) => !r.assignedStaffEmail).length;
  const openNoTeller = rows.filter((r) => counterModeMeta(r.mode).key === "active" && !r.assignedStaffEmail).length;
  const sorted = [...rows].sort((a, b) => a.number - b.number);
  const shown = filter === "all" ? sorted : sorted.filter((r) => counterModeMeta(r.mode).key === filter);
  const drawerRow = rows.find((r) => r.id === expandedCounterId) ?? null;
  const noLanes = rows.filter((r) => r.allowedServiceTypeIds.length === 0).length;
  const firstToOpen = sorted.find((r) => r.allowedServiceTypeIds.length > 0) ?? sorted[0];
  const noneOpen = branchOpenForOperations && rows.length > 0 && stats.open === 0 && stats.break === 0;

  const laneNames = (r: ManagerCounterRowDto) =>
    r.listenedQueueLabels && r.listenedQueueLabels.length > 0
      ? r.listenedQueueLabels
      : services.filter((s) => r.allowedServiceTypeIds.includes(s.id)).map((s) => s.name);

  const modeOptions = (r: ManagerCounterRowDto): SegOption<Mode>[] => {
    const cantOpen = !branchOpenForOperations || r.allowedServiceTypeIds.length === 0;
    return [
      {
        value: "Active",
        label: "Open",
        tone: "success",
        disabled: busy || (cantOpen && counterModeMeta(r.mode).key !== "active"),
        title: !branchOpenForOperations ? "Branch is closed" : r.allowedServiceTypeIds.length === 0 ? "Pick a service first" : undefined,
      },
      { value: "Break", label: "Break", tone: "warning", disabled: busy },
      { value: "Closed", label: "Closed", tone: "neutral", disabled: busy },
    ];
  };

  const staffSelect = (r: ManagerCounterRowDto, ghost: boolean) => (
    <select
      className={`m-select ${ghost ? "m-select--sm m-select--ghost" : ""}`}
      value={staffIdForRow(r)}
      disabled={busy}
      onChange={(e) => void onStaffChange(r.id, e.target.value)}
      aria-label={`Teller for counter ${r.number}`}
    >
      <option value="">No teller</option>
      {staffPickList.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHeader
        title="Counters"
        description={
          <>
            <strong>{stats.open} of {stats.total}</strong> open
          </>
        }
      />

      {!branchOpenForOperations ? (
        <div className="m-callout" role="status">
          <AlertTriangle size={16} aria-hidden />
          <span>Branch is closed now.</span>
        </div>
      ) : null}

      {noneOpen ? (
        <div className="m-callout m-callout--info" role="status">
          <Info size={16} aria-hidden />
          <span className="m-callout__text">
            <strong>No counters open.</strong> Pick a teller, then set Open.
          </span>
          {firstToOpen ? (
            <button type="button" className="m-btn m-btn--primary m-btn--sm m-callout__action" onClick={() => onToggleExpand(firstToOpen.id)}>
              <Power size={14} aria-hidden /> Open counter
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="m-stats">
        <StatCard label="Open" icon={Power} value={stats.open} context={stats.open === 0 ? "None open" : "Serving now"} />
        <StatCard label="On break" icon={Coffee} value={stats.break} context={stats.break === 0 ? "No one on break" : "Paused"} />
        <StatCard label="Closed" icon={Monitor} value={stats.closed} context={stats.closed === 0 ? "All in use" : noLanes > 0 ? `${noLanes} need services` : "Ready to open"} />
        <StatCard
          label="No teller"
          icon={UserX}
          value={unassigned}
          badge={openNoTeller > 0 ? <Badge tone="warning" dot>Fix now</Badge> : undefined}
          context={unassigned === 0 ? "All staffed" : openNoTeller > 0 ? `${openNoTeller} open, no teller` : "Closed ones only"}
        />
      </div>

      <Card
        title="All counters"
        action={
          <Segmented<Filter>
            label="Filter counters"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: stats.total },
              { value: "active", label: "Open", count: stats.open },
              { value: "break", label: "Break", count: stats.break },
              { value: "closed", label: "Closed", count: stats.closed },
            ]}
          />
        }
        flush
      >
        {rows.length === 0 ? (
          <EmptyBlock title="No counters yet" body="Add counters to get started." />
        ) : shown.length === 0 ? (
          <EmptyBlock title="No matches" body="Try another filter." />
        ) : (
          <div className="m-table-wrap m-table-wrap--bordered">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Counter</th>
                  <th>Status</th>
                  <th>Teller</th>
                  <th>Serves</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const m = counterModeMeta(r.mode);
                  const lanes = laneNames(r);
                  return (
                    <tr key={r.id} id={`counter-${r.id}`} className={drawerRow?.id === r.id ? "is-selected" : m.key === "closed" && !r.assignedStaffEmail ? "is-muted" : undefined}>
                      <td>
                        <span className="m-cell-flex">
                          <span className={`m-token m-token--lg m-token--${m.key === "active" ? "success" : m.key === "break" ? "warning" : "neutral"}`}>{r.number}</span>
                          <span>
                            <span className="m-cell-main">Counter {r.number}</span>
                            {r.currentDedicatedLaneName ? <span className="m-cell-sub">Shows {r.currentDedicatedLaneName}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td>
                        <Segmented<Mode>
                          label={`Counter ${r.number} status`}
                          size="sm"
                          value={MODE_VALUE[m.key]}
                          onChange={(v) => v !== MODE_VALUE[m.key] && void onSetMode(r.id, v)}
                          options={modeOptions(r)}
                        />
                      </td>
                      <td>
                        <span className="m-cell-flex">
                          {staffSelect(r, true)}
                          {m.key === "active" && !r.assignedStaffEmail ? <Badge tone="warning" size="sm">No teller</Badge> : null}
                        </span>
                      </td>
                      <td>
                        <Chips items={lanes} max={3} empty={<Badge tone="warning" size="sm">No services</Badge>} />
                      </td>
                      <td className="m-num">
                        <button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={() => onToggleExpand(r.id)}>
                          <Settings2 size={14} aria-hidden /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={drawerRow != null}
        title={drawerRow ? `Counter ${drawerRow.number}` : ""}
        description="Saved as you go"
        onClose={() => drawerRow && onToggleExpand(drawerRow.id)}
        footer={
          drawerRow ? (
            <button type="button" className="m-btn m-btn--secondary" onClick={() => onToggleExpand(drawerRow.id)}>
              Done
            </button>
          ) : null
        }
      >
        {drawerRow ? (
          <>
            {counterModeMeta(drawerRow.mode).key === "closed" && (drawerRow.allowedServiceTypeIds.length === 0 || !drawerRow.assignedStaffEmail) ? (
              <SetupSteps
                steps={[
                  { label: "Pick services", done: drawerRow.allowedServiceTypeIds.length > 0 },
                  { label: "Pick a teller", done: !!drawerRow.assignedStaffEmail },
                  { label: "Set to Open", done: false },
                ]}
              />
            ) : null}
            <div className="m-drawer__section">
              <span className="m-drawer__section-title">Status</span>
              <Segmented<Mode>
                label="Status"
                value={MODE_VALUE[counterModeMeta(drawerRow.mode).key]}
                onChange={(v) => v !== MODE_VALUE[counterModeMeta(drawerRow.mode).key] && void onSetMode(drawerRow.id, v)}
                options={modeOptions(drawerRow)}
              />
            </div>
            <label className="m-field">
              <span className="m-field__label">Teller</span>
              {staffSelect(drawerRow, false)}
              {staffPickList.length === 0 ? <span className="m-field__hint">No staff yet.</span> : null}
            </label>
            <div className="m-drawer__section">
              <span className="m-drawer__section-title">Services</span>
              <span className="m-field__hint">Keep at least one.</span>
              {services.length === 0 ? (
                <EmptyBlock
                  inline
                  icon={Layers}
                  title="No services yet"
                  body="Add them in Service Lanes."
                  action={
                    onGoToTab ? (
                      <button type="button" className="m-btn m-btn--link" onClick={() => onGoToTab("queues")}>Open Service Lanes</button>
                    ) : undefined
                  }
                />
              ) : (
              <div className="m-check-list m-check-list--1">
                {services.map((s) => (
                  <label key={s.id} className="m-check">
                    <input
                      type="checkbox"
                      checked={drawerRow.allowedServiceTypeIds.includes(s.id)}
                      disabled={busy}
                      onChange={(e) => void onAllowedLaneToggle(drawerRow.id, s.id, e.target.checked)}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
              )}
            </div>
            <label className="m-field">
              <span className="m-field__label">Display lane</span>
              <select
                className="m-select"
                value={drawerRow.currentDedicatedServiceTypeId ?? ""}
                disabled={busy}
                onChange={(e) => void onDedicatedLaneChange(drawerRow.id, e.target.value)}
              >
                <option value="">None</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="m-field__hint">
                {drawerRow.allowedServiceTypeIds.length === 0 ? "Pick services first." : "Shown on the counter screen."}
              </span>
            </label>
          </>
        ) : null}
      </Drawer>
    </>
  );
}

/** Short checklist shown in the drawer while a closed counter is not ready to open. */
function SetupSteps({ steps }: { steps: { label: string; done: boolean }[] }) {
  return (
    <div className="m-setup" aria-label="Counter setup">
      <span className="m-setup__title">To open this counter</span>
      <ol className="m-setup__list">
        {steps.map((st, i) => (
          <li key={st.label} className={st.done ? "is-done" : undefined}>
            <span className="m-setup__num" aria-hidden>{st.done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
            {st.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
