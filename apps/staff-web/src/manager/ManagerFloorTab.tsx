import type { AssignableStaffDto, BranchDto, ManagerCounterRowDto } from "../api";
import { StatusPill } from "../components/StatusPill";
import { counterModeKey, personInitials, staffDisplayName } from "./managerUtils";

type Props = {
  rows: ManagerCounterRowDto[];
  branch: BranchDto | undefined;
  branchOpenForOperations?: boolean;
  staffPickList: AssignableStaffDto[];
  busy: boolean;
  expandedCounterId: string | null;
  onToggleExpand: (id: string) => void;
  onSetMode: (counterId: string, mode: "Active" | "Break" | "Closed") => void;
  onStaffChange: (counterId: string, value: string) => void;
  onAllowedLaneToggle: (counterId: string, laneId: string, checked: boolean) => void;
  onDedicatedLaneChange: (counterId: string, serviceTypeId: string) => void;
  staffIdForRow: (r: ManagerCounterRowDto) => string;
};

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
}: Props) {
  return (
    <section className="qgo-mgr-panel qgo-mgr-panel--floor" aria-labelledby="mgr-floor-heading">
      <header className="qgo-mgr-toolbar qgo-mgr-toolbar--inset">
        <div>
          <h1 id="mgr-floor-heading">Counters</h1>
          <p className="qgo-muted">Counter status, teller assignment, and lane configuration.</p>
        </div>
        <p className="qgo-mgr-panel__meta">
          <strong>{rows.length}</strong> counters
        </p>
      </header>

      <div className="qgo-mgr-panel__body">
      {!branchOpenForOperations ? (
        <div className="qgo-banner qgo-banner--warn qgo-mgr-hours-banner" role="status">
          Branch is <strong>outside operating hours</strong>. Counters cannot be opened until the scheduled open time.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="qgo-muted qgo-mgr-empty">No counters configured for this branch.</p>
      ) : (
        <div className="qgo-floor-grid">
          {rows.map((r) => {
            const expanded = expandedCounterId === r.id;
            const modeKey = counterModeKey(r.mode);
            const tellerName = staffDisplayName(r, staffPickList);
            const laneLabels =
              r.allowedServiceTypeIds.length === 0
                ? []
                : (branch?.services ?? [])
                    .filter((s) => r.allowedServiceTypeIds.includes(s.id))
                    .map((s) => s.name);

            return (
              <article
                key={r.id}
                id={`counter-${r.id}`}
                className={`qgo-floor-card qgo-floor-card--${modeKey}${expanded ? " qgo-floor-card--expanded" : ""}`}
              >
                <div className="qgo-floor-card__stripe" aria-hidden />

                <div className="qgo-floor-card__header">
                  <div className="qgo-floor-card__num" aria-hidden>
                    {r.number}
                  </div>
                  <div className="qgo-floor-card__title">
                    <h3>Counter {r.number}</h3>
                    <StatusPill mode={r.mode} size="sm" />
                  </div>
                </div>

                <div className="qgo-floor-card__teller">
                  <span className={`qgo-floor-card__avatar${tellerName === "Unassigned" ? " qgo-floor-card__avatar--empty" : ""}`}>
                    {tellerName === "Unassigned" ? "—" : personInitials(tellerName)}
                  </span>
                  <div>
                    <span className="qgo-floor-card__teller-label">Teller</span>
                    <strong>{tellerName}</strong>
                  </div>
                </div>

                <div className="qgo-floor-card__lanes">
                  {laneLabels.length === 0 ? (
                    <span className="qgo-floor-card__lane qgo-floor-card__lane--warn">No lanes assigned</span>
                  ) : (
                    laneLabels.map((name) => (
                      <span key={name} className="qgo-floor-card__lane">
                        {name}
                      </span>
                    ))
                  )}
                </div>

                <dl className="qgo-floor-card__meta">
                  <div>
                    <dt>Display lane</dt>
                    <dd>{r.currentDedicatedLaneName ?? "—"}</dd>
                  </div>
                </dl>

                <button type="button" className="qgo-floor-card__configure" onClick={() => onToggleExpand(r.id)}>
                  {expanded ? "Hide configuration" : "Configure counter"}
                  <span className="qgo-floor-card__chevron" aria-hidden>
                    {expanded ? "▴" : "▾"}
                  </span>
                </button>

                {expanded ? (
                  <div className="qgo-floor-card__drawer">
                    <label className="qgo-field">
                      <span>Teller assignment</span>
                      <select value={staffIdForRow(r)} disabled={busy} onChange={(e) => void onStaffChange(r.id, e.target.value)}>
                        <option value="">Unassigned</option>
                        {staffPickList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.email})
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="qgo-fieldset">
                      <legend>Allowed lanes</legend>
                      {r.mode === "Closed" ? (
                        <p className="qgo-muted">Counter is closed — lane changes apply when you reopen.</p>
                      ) : null}
                      <div className="qgo-lane-picks">
                        {(branch?.services ?? []).map((s) => (
                          <label key={s.id} className="qgo-check">
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
                    <label className="qgo-field">
                      <span>Primary display lane</span>
                      <select
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

                <footer className="qgo-floor-card__modes" role="group" aria-label={`Counter ${r.number} status`}>
                  <button
                    type="button"
                    className={`qgo-floor-mode qgo-floor-mode--open${modeKey === "active" ? " is-selected" : ""}`}
                    disabled={busy || r.allowedServiceTypeIds.length === 0 || !branchOpenForOperations}
                    title={
                      !branchOpenForOperations
                        ? "Outside branch operating hours"
                        : r.allowedServiceTypeIds.length === 0
                          ? "Assign at least one lane first"
                          : undefined
                    }
                    onClick={() => void onSetMode(r.id, "Active")}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className={`qgo-floor-mode qgo-floor-mode--break${modeKey === "break" ? " is-selected" : ""}`}
                    disabled={busy}
                    onClick={() => void onSetMode(r.id, "Break")}
                  >
                    Break
                  </button>
                  <button
                    type="button"
                    className={`qgo-floor-mode qgo-floor-mode--closed${modeKey === "closed" ? " is-selected" : ""}`}
                    disabled={busy}
                    onClick={() => void onSetMode(r.id, "Closed")}
                  >
                    Closed
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      </div>
    </section>
  );
}
