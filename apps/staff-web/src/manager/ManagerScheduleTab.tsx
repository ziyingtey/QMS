import { Save, Copy } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { BranchOperatingHourRow, BranchOperationalSettings } from "../api";
import { minsToClock, minsToTimeInput, timeInputToMins } from "./managerUtils";

type Props = {
  settings: BranchOperationalSettings | null;
  busy: boolean;
  formOnline: number;
  setFormOnline: (n: number) => void;
  formSlot: number;
  setFormSlot: (n: number) => void;
  formWeekly: BranchOperatingHourRow[];
  setFormWeekly: Dispatch<SetStateAction<BranchOperatingHourRow[]>>;
  formAdaptiveCap: boolean;
  setFormAdaptiveCap: (v: boolean) => void;
  formMinSlotTotal: string;
  setFormMinSlotTotal: (v: string) => void;
  formMaxSlotTotal: string;
  setFormMaxSlotTotal: (v: string) => void;
  formEarlyCallMinutes: number;
  setFormEarlyCallMinutes: (n: number) => void;
  formCalledGraceMinutes: number;
  setFormCalledGraceMinutes: (n: number) => void;
  onSave: () => void;
};

export function ManagerScheduleTab(props: Props) {
  const {
    settings,
    busy,
    formOnline,
    setFormOnline,
    formSlot,
    setFormSlot,
    formWeekly,
    setFormWeekly,
    formAdaptiveCap,
    setFormAdaptiveCap,
    formMinSlotTotal,
    setFormMinSlotTotal,
    formMaxSlotTotal,
    setFormMaxSlotTotal,
    formEarlyCallMinutes,
    setFormEarlyCallMinutes,
    formCalledGraceMinutes,
    setFormCalledGraceMinutes,
    onSave,
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
          <span>
            Walk-in quota <strong>{settings.walkInQuotaPercent}%</strong>
          </span>
        </div>
      ) : null}

      <section className="qgo-mgr-panel">
        <header className="qgo-mgr-panel__head">
          <h2>Booking rules</h2>
          <p className="qgo-muted">How online and walk-in share each time slot.</p>
        </header>
        <div className="qgo-mgr-form-grid-2col">
          <label className="qgo-field">
            <span>Online booking %</span>
            <input type="number" min={0} max={100} value={formOnline} onChange={(e) => setFormOnline(Number(e.target.value))} />
          </label>
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
        </div>
      </section>

      <section className="qgo-mgr-panel">
        <header className="qgo-mgr-panel__head">
          <h2>Capacity</h2>
          <p className="qgo-muted">Optional slot limits and overbooking alerts.</p>
        </header>
        <div className="qgo-mgr-form-body">
          <label className="qgo-check qgo-check--block">
            <input type="checkbox" checked={formAdaptiveCap} onChange={(e) => setFormAdaptiveCap(e.target.checked)} />
            <span>Capacity monitoring — alert when online bookings exceed slot seats</span>
          </label>
          <div className="qgo-mgr-form-grid-2col">
            <label className="qgo-field">
              <span>Min customers per slot (optional)</span>
              <input type="number" min={0} placeholder="None" value={formMinSlotTotal} onChange={(e) => setFormMinSlotTotal(e.target.value)} />
            </label>
            <label className="qgo-field">
              <span>Max customers per slot (optional)</span>
              <input type="number" min={1} placeholder="None" value={formMaxSlotTotal} onChange={(e) => setFormMaxSlotTotal(e.target.value)} />
            </label>
          </div>
        </div>
      </section>

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

      <div className="qgo-mgr-save-bar qgo-mgr-save-bar--sticky">
        <p className="qgo-muted">Changes apply to new bookings and queue rules immediately after save.</p>
        <button type="button" className="qgo-btn-primary qgo-btn-primary--lg" disabled={busy} onClick={() => void onSave()}>
          <Save size={16} /> Save schedule & capacity
        </button>
      </div>
    </div>
  );
}
