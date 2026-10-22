import { CalendarX, Copy, Plus, Save, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { BranchClosure, BranchDto, BranchOperatingHourRow, BranchOperationalSettings } from "../api";
import { Badge, Card, EmptyBlock, PageHeader } from "./ui";
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

  const setDayOpen = (idx: number, open: boolean) =>
    setFormWeekly((prev) =>
      prev.map((x, i) =>
        i === idx
          ? {
              ...x,
              isClosed: !open,
              openMinutesFromMidnight: open ? (x.openMinutesFromMidnight ?? 9 * 60) : null,
              closeMinutesFromMidnight: open ? (x.closeMinutesFromMidnight ?? 17 * 60) : null,
            }
          : x,
      ),
    );

  // Unsaved-changes detection against the last loaded settings (booking rules + hours).
  const dirty =
    settings != null &&
    (formSlot !== settings.slotDurationMinutes ||
      formEarlyCallMinutes !== (settings.onlineEarlyCallMinutes ?? 10) ||
      formCalledGraceMinutes !== (settings.calledAbsentGraceMinutes ?? 5) ||
      formNextWeekOpensDay !== (settings.nextWeekBookingOpensOnDay ?? 6) ||
      formMaxSlotTotal !== (settings.maxSlotTotalCapacity != null ? String(settings.maxSlotTotalCapacity) : "") ||
      JSON.stringify(formWeekly) !== JSON.stringify(settings.weeklyOperatingHours ?? formWeekly));

  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const today = formWeekly.find((r) => r.dayOfWeek === todayName);
  const todayLabel =
    !today || today.isClosed || today.openMinutesFromMidnight == null || today.closeMinutesFromMidnight == null
      ? "closed today"
      : `open today ${minsToClock(today.openMinutesFromMidnight)} – ${minsToClock(today.closeMinutesFromMidnight)}`;
  const openDays = formWeekly.filter((r) => !r.isClosed).length;
  const upcoming = [...closures].sort((a, b) => a.closedFrom.localeCompare(b.closedFrom));

  return (
    <>
      <PageHeader
        title="Schedule & Capacity"
        description={
          <>
            Branch is <strong>{todayLabel}</strong>
          </>
        }
        actions={
          <>
            {settings ? (
              <Badge tone="outline">
                UTC{settings.serviceZoneOffsetMinutes >= 0 ? "+" : ""}
                {settings.serviceZoneOffsetMinutes / 60}
              </Badge>
            ) : null}
            {dirty ? <Badge tone="warning" dot>Not saved</Badge> : null}
            <button type="button" className="m-btn m-btn--primary" disabled={busy} onClick={() => void onSave()}>
              <Save size={15} aria-hidden /> Save
            </button>
          </>
        }
      />

      <div className="m-grid m-grid--top">
        <div className="m-col-7 m-stack">
          <Card
            title="Opening hours"
            description={`Open ${openDays} days a week`}
            action={
              <button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={copyMondayToAll} title="Copy Monday to Tue–Fri">
                <Copy size={14} aria-hidden /> Copy Monday
              </button>
            }
            flush
          >
            <div className="m-table-wrap m-table-wrap--bordered">
              <table className="m-table m-table--compact">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Open</th>
                    <th>Opens</th>
                    <th>Closes</th>
                    <th className="m-num">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {formWeekly.map((r, idx) => {
                    const mins =
                      r.isClosed || r.openMinutesFromMidnight == null || r.closeMinutesFromMidnight == null
                        ? null
                        : r.closeMinutesFromMidnight - r.openMinutesFromMidnight;
                    return (
                      <tr key={r.dayOfWeek} className={r.isClosed ? "is-muted" : undefined}>
                        <td>
                          <span className="m-cell-main">{r.dayOfWeek}</span>
                          {r.dayOfWeek === todayName ? <> <Badge tone="info" size="sm">Today</Badge></> : null}
                        </td>
                        <td>
                          <label className="m-switch">
                            <input type="checkbox" checked={!r.isClosed} onChange={(e) => setDayOpen(idx, e.target.checked)} aria-label={`${r.dayOfWeek} open`} />
                            <span className="m-muted">{r.isClosed ? "Closed" : "Open"}</span>
                          </label>
                        </td>
                        <td>
                          <input
                            type="time"
                            className="m-input m-input--sm"
                            aria-label={`${r.dayOfWeek} opens`}
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
                            className="m-input m-input--sm"
                            aria-label={`${r.dayOfWeek} closes`}
                            disabled={r.isClosed}
                            value={minsToTimeInput(r.closeMinutesFromMidnight)}
                            onChange={(e) => {
                              const v = timeInputToMins(e.target.value);
                              setFormWeekly((prev) => prev.map((x, i) => (i === idx ? { ...x, closeMinutesFromMidnight: v } : x)));
                            }}
                          />
                        </td>
                        <td className="m-num m-muted">{mins == null ? "—" : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
  
          <Card
            title="Online bookings per slot"
            description="Set 0 to turn off"
          >
            {branch && branch.services.length > 0 ? (
              <div className="m-quota-grid">
                {branch.services.map((s) => {
                  const v = serviceOnlineSlots[s.id] ?? 4;
                  return (
                    <label key={s.id} className={`m-quota${v === 0 ? " is-off" : ""}`}>
                      <span className="m-quota__name">{s.name}</span>
                      <input
                        className="m-input m-input--sm m-input--num"
                        type="number"
                        min={0}
                        max={100}
                        value={v}
                        disabled={busy}
                        onChange={(e) => onServiceOnlineSlotsChange(s.id, Number(e.target.value))}
                        aria-label={`${s.name} online quota`}
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <EmptyBlock title="No services yet" />
            )}
          </Card>
  
        </div>
        <div className="m-col-5 m-stack">
          <Card title="Booking rules">
            <div className="m-form-grid m-form-grid--2">
              <label className="m-field">
                <span className="m-field__label">Slot length</span>
                <span className="m-input-group">
                  <input className="m-input" type="number" min={5} max={180} value={formSlot} onChange={(e) => setFormSlot(Number(e.target.value))} />
                  <span>min</span>
                </span>
              </label>
              <label className="m-field">
                <span className="m-field__label">Max per slot</span>
                <input className="m-input" type="number" min={1} placeholder="No limit" value={formMaxSlotTotal} onChange={(e) => setFormMaxSlotTotal(e.target.value)} />
              </label>
              <label className="m-field">
                <span className="m-field__label">Early call</span>
                <span className="m-input-group">
                  <input className="m-input" type="number" min={0} max={120} value={formEarlyCallMinutes} onChange={(e) => setFormEarlyCallMinutes(Number(e.target.value))} />
                  <span>min</span>
                </span>
                <span className="m-field__hint">Call before the slot</span>
              </label>
              <label className="m-field">
                <span className="m-field__label">Missed after</span>
                <span className="m-input-group">
                  <input className="m-input" type="number" min={1} max={60} value={formCalledGraceMinutes} onChange={(e) => setFormCalledGraceMinutes(Number(e.target.value))} />
                  <span>min</span>
                </span>
                <span className="m-field__hint">No reply after a call</span>
              </label>
              <label className="m-field m-field--span">
                <span className="m-field__label">Next week opens on</span>
                <select className="m-select" value={formNextWeekOpensDay} onChange={(e) => setFormNextWeekOpensDay(Number(e.target.value))}>
                  {Object.entries(DAY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          </Card>
  
          <Card
            title="Closures"
            description="Holidays and days off"
          >
            <div className="m-stack">
              <ClosureForm busy={busy} onAdd={onAddClosure} />
              {upcoming.length === 0 ? (
                <EmptyBlock inline icon={CalendarX} title="No closures" body="Normal hours apply." />
              ) : (
                <ul className="m-closures">
                  {upcoming.map((c) => (
                    <li key={c.id}>
                      <span className="m-closures__date">
                        <b>{new Date(c.closedFrom).toLocaleDateString([], { day: "numeric" })}</b>
                        {new Date(c.closedFrom).toLocaleDateString([], { month: "short" })}
                      </span>
                      <span className="m-list__main">
                        <span className="m-list__title">{c.reason || "Branch closed"}</span>
                        <span className="m-list__sub">
                          {new Date(c.closedFrom).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} to{" "}
                          {new Date(c.closedTo).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="m-btn m-btn--ghost m-btn--icon m-btn--sm"
                        disabled={busy}
                        onClick={() => onDeleteClosure(c.id)}
                        title="Remove closure"
                        aria-label="Remove closure"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
  
        </div>
      </div>
    </>
  );
}

function ClosureForm({ busy, onAdd }: { busy: boolean; onAdd: (from: string, to: string, reason: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="m-closure-form"
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
      <label className="m-field">
        <span className="m-field__label">From</span>
        <input className="m-input m-input--sm" type="date" name="from" required min={today} disabled={busy} />
      </label>
      <label className="m-field">
        <span className="m-field__label">To</span>
        <input className="m-input m-input--sm" type="date" name="to" required min={today} disabled={busy} />
      </label>
      <label className="m-field m-field--span">
        <span className="m-field__label">Reason</span>
        <input className="m-input m-input--sm" type="text" name="reason" placeholder="e.g. Public holiday" disabled={busy} />
      </label>
      <button type="submit" className="m-btn m-btn--secondary m-btn--sm" disabled={busy}>
        <Plus size={14} aria-hidden /> Add
      </button>
    </form>
  );
}
