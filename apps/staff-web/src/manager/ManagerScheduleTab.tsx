import { Save, Copy, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { BranchClosure, BranchDto, BranchOperatingHourRow, BranchOperationalSettings } from "../api";
import { minsToClock, minsToTimeInput, timeInputToMins } from "./managerUtils";

const DAY_LABELS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

type Props = {
  settings: BranchOperationalSettings | null;
  branch: BranchDto | undefined;
  busy: boolean;
  formSlot: number;
  setFormSlot: (n: number) => void;
  formWeekly: BranchOperatingHourRow[];
  setFormWeekly: Dispatch<SetStateAction<BranchOperatingHourRow[]>>;
  formMaxSlotTotal: string;
  setFormMaxSlotTotal: (v: string) => void;
  formEarlyCallMinutes: number;
  setFormEarlyCallMinutes: (n: number) => void;
  formCalledGraceMinutes: number;
  setFormCalledGraceMinutes: (n: number) => void;
  formNextWeekOpensDay: number;
  setFormNextWeekOpensDay: (n: number) => void;
  onSave: () => void;
  // Per-service online slots
  serviceOnlineSlots: Record<string, number>;
  onServiceOnlineSlotsChange: (serviceId: string, value: number) => void;
  // Closures
  closures: BranchClosure[];
  onAddClosure: (from: string, to: string, reason: string) => void;
  onDeleteClosure: (id: string) => void;
};

export function ManagerScheduleTab(props: Props) {
  const {
    settings,
    branch,
    busy,
    formSlot,
    setFormSlot,
    formWeekly,
    setFormWeekly,
    formMaxSlotTotal,
    setFormMaxSlotTotal,
    formEarlyCallMinutes,
    setFormEarlyCallMinutes,
    formCalledGraceMinutes,
    setFormCalledGraceMinutes,
    formNextWeekOpensDay,
    setFormNextWeekOpensDay,
    onSave,
    serviceOnlineSlots,
    onServiceOnlineSlotsChange,
    closures,
    onAddClosure,
    onDeleteClosure,
  } = props;

  const copyMondayToAll = () => {
    const mon = formWeekly.find((r) => r.dayOfWeek === "Monday");
    if (!mon || mon.isClosed) return;
    setFormWeekly((prev) =>
      prev.map((r) =>
        r.dayOfWeek === "Saturday" || r.dayOfWeek === "Sunday"
          ? r
          : { ...r, isClosed: false, openMinutesFromMidnight: mon.openMinutesFromMidnight, closeMinutesFromMidnight: mon.closeMinutesFromMidnight },
      ),
    );
  };

  return (
    <div className="qgo-mgr-schedule">
      <header className="qgo-mgr-toolbar qgo-mgr-toolbar--inset">
        <div>
          <h1>Schedule & capacity</h1>
          <p className="qgo-muted">Booking rules, slot limits, and branch hours.</p>
        </div>
      </header>

      {settings ? (
        <div className="qgo-mgr-settings-meta qgo-mgr-settings-meta--top">
          <span>
            Time zone <strong>UTC+{settings.serviceZoneOffsetMinutes / 60}</strong>
          </span>
        </div>
      ) : null}

      {/* ── Booking rules ── */}
      <section className="qgo-mgr-panel">
        <header className="qgo-mgr-panel__head">
          <h2>Booking rules</h2>
          <p className="qgo-muted">Slot timing and queue behaviour.</p>
        </header>
        <div className="qgo-mgr-form-grid-2col">
          <label className="qgo-field">
            <span>Slot duration (minutes)</span>
            <input type="number" min={5} max={180} value={formSlot} onChange={(e) => setFormSlot(Number(e.target.value))} />
          </label>
          <label className="qgo-field">
            <span>Online early call (min before slot)</span>
            <input type="number" min={0} max={120} value={formEarlyCallMinutes} onChange={(e) => setFormEarlyCallMinutes(Number(e.target.value))} />
          </label>
          <label className="qgo-field">
            <span>No-show grace after call (minutes)</span>
            <input type="number" min={1} max={60} value={formCalledGraceMinutes} onChange={(e) => setFormCalledGraceMinutes(Number(e.target.value))} />
          </label>
          <label className="qgo-field">
            <span>Max customers per slot (optional)</span>
            <input type="number" min={1} placeholder="None" value={formMaxSlotTotal} onChange={(e) => setFormMaxSlotTotal(e.target.value)} />
          </label>
          <label className="qgo-field">
            <span>Next-week booking opens on</span>
            <select value={formNextWeekOpensDay} onChange={(e) => setFormNextWeekOpensDay(Number(e.target.value))}>
              {Object.entries(DAY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ── Per-service online booking quotas ── */}
      {branch && branch.services.length > 0 ? (
        <section className="qgo-mgr-panel">
          <header className="qgo-mgr-panel__head">
            <h2>Online booking quota per service</h2>
            <p className="qgo-muted">Max online bookings per slot for each service (0 = disabled).</p>
          </header>
          <div className="qgo-mgr-form-body">
            <div className="qgo-mgr-form-grid-2col">
              {branch.services.map((s) => (
                <label key={s.id} className="qgo-field">
                  <span>{s.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={serviceOnlineSlots[s.id] ?? 4}
                    disabled={busy}
                    onChange={(e) => onServiceOnlineSlotsChange(s.id, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Operating hours ── */}
      <section className="qgo-mgr-panel">
        <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
          <div>
            <h2>Operating hours</h2>
            <p className="qgo-muted">Branch open and close times for each day.</p>
          </div>
          <button type="button" className="qgo-btn-secondary qgo-btn-sm" onClick={copyMondayToAll} title="Copy Monday hours to all weekdays">
            <Copy size={14} /> Copy Mon → weekdays
          </button>
        </header>
        <div className="qgo-table-wrap qgo-table-wrap--card">
          <table className="qgo-table qgo-table--mgr qgo-table--hours">
            <thead>
              <tr>
                <th>Day</th>
                <th>Closed</th>
                <th>Opens</th>
                <th>Closes</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {formWeekly.map((r, idx) => (
                <tr key={r.dayOfWeek} className={r.isClosed ? "qgo-table__row--muted" : undefined}>
                  <td>
                    <strong>{r.dayOfWeek}</strong>
                  </td>
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
                                  openMinutesFromMidnight: closed ? null : (x.openMinutesFromMidnight ?? 9 * 60),
                                  closeMinutesFromMidnight: closed ? null : (x.closeMinutesFromMidnight ?? 17 * 60),
                                }
                              : x,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      disabled={r.isClosed}
                      value={minsToTimeInput(r.openMinutesFromMidnight)}
                      onChange={(e) => {
                        const v = timeInputToMins(e.target.value);
                        setFormWeekly((prev) => prev.map((x, i) => (i === idx ? { ...x, openMinutesFromMidnight: v } : x)));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      disabled={r.isClosed}
                      value={minsToTimeInput(r.closeMinutesFromMidnight)}
                      onChange={(e) => {
                        const v = timeInputToMins(e.target.value);
                        setFormWeekly((prev) => prev.map((x, i) => (i === idx ? { ...x, closeMinutesFromMidnight: v } : x)));
                      }}
                    />
                  </td>
                  <td className="qgo-muted">
                    {r.isClosed || r.openMinutesFromMidnight == null || r.closeMinutesFromMidnight == null
                      ? "Closed"
                      : `${minsToClock(r.openMinutesFromMidnight)} – ${minsToClock(r.closeMinutesFromMidnight)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Branch closures ── */}
      <section className="qgo-mgr-panel">
        <header className="qgo-mgr-panel__head qgo-mgr-panel__head--row">
          <div>
            <h2>Branch closures</h2>
            <p className="qgo-muted">Ad-hoc closure dates (e.g. public holidays, maintenance).</p>
          </div>
        </header>
        <div className="qgo-mgr-form-body">
          <ClosureForm busy={busy} onAdd={onAddClosure} />
          {closures.length === 0 ? (
            <p className="qgo-muted" style={{ padding: "8px 0" }}>No closures configured.</p>
          ) : (
            <ul className="qgo-mgr-closure-list">
              {closures.map((c) => (
                <li key={c.id} className="qgo-mgr-closure-row">
                  <div>
                    <strong>{new Date(c.closedFrom).toLocaleDateString()}</strong>
                    {" → "}
                    <strong>{new Date(c.closedTo).toLocaleDateString()}</strong>
                    {c.reason ? <span className="qgo-muted"> — {c.reason}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="qgo-btn-secondary qgo-btn-sm qgo-btn--danger"
                    disabled={busy}
                    onClick={() => onDeleteClosure(c.id)}
                    title="Remove closure"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="qgo-mgr-save-bar qgo-mgr-save-bar--sticky">
        <p className="qgo-muted">Changes apply to new bookings and queue rules immediately after save.</p>
        <button type="button" className="qgo-btn-primary qgo-btn-primary--lg" disabled={busy} onClick={() => void onSave()}>
          <Save size={16} /> Save schedule & capacity
        </button>
      </div>
    </div>
  );
}

function ClosureForm({ busy, onAdd }: { busy: boolean; onAdd: (from: string, to: string, reason: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="qgo-mgr-closure-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const from = fd.get("from") as string;
        const to = fd.get("to") as string;
        const reason = fd.get("reason") as string;
        if (!from || !to) return;
        onAdd(from, to, reason);
        e.currentTarget.reset();
      }}
    >
      <label className="qgo-field">
        <span>From</span>
        <input type="date" name="from" required min={today} disabled={busy} />
      </label>
      <label className="qgo-field">
        <span>To</span>
        <input type="date" name="to" required min={today} disabled={busy} />
      </label>
      <label className="qgo-field qgo-field--wide">
        <span>Reason (optional)</span>
        <input type="text" name="reason" placeholder="e.g. Public holiday" disabled={busy} />
      </label>
      <button type="submit" className="qgo-btn-secondary qgo-btn-sm" disabled={busy}>
        <Plus size={14} /> Add
      </button>
    </form>
  );
}
