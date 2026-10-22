import { useMemo, useState } from "react";
import { AlertTriangle, Layers, Pencil, UserRound, Users } from "lucide-react";
import type { BranchDto, BranchQueueDto } from "../api";
import { Badge, Card, Chips, Drawer, EmptyBlock, PageHeader, StatCard } from "./ui";
import { waitTone } from "./uiTones";
import type { ManagerTab } from "./managerNav";

type Props = {
  branch: BranchDto | undefined;
  queues: BranchQueueDto[];
  busy: boolean;
  onUpdate: (
    queueId: string,
    patch: { name?: string; ticketPrefix?: string; serviceLevelMinutes?: number; isActive?: boolean },
  ) => Promise<void>;
  onSetServices: (queueId: string, serviceTypeIds: string[]) => Promise<void>;
  onGoToTab?: (tab: ManagerTab) => void;
};

type Draft = { name: string; ticketPrefix: string; serviceLevelMinutes: number; isActive: boolean };

/** Service Lanes: "Which services feed each lettered queue, and what is its SLA?" */
export function ManagerQueuesTab({ branch, queues, busy, onUpdate, onSetServices }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picks, setPicks] = useState<string[]>([]);

  const services = branch?.services ?? [];
  const totals = useMemo(() => {
    const waiting = queues.reduce((a, q) => a + (q.waitingCount ?? 0), 0);
    const serving = queues.reduce((a, q) => a + (q.servingCount ?? 0), 0);
    const breaches = queues.reduce((a, q) => a + (q.slaBreachCount ?? 0), 0);
    const active = queues.filter((q) => q.isActive).length;
    return { waiting, serving, breaches, active };
  }, [queues]);

  const sorted = [...queues].sort(
    (a, b) => b.waitingCount + b.servingCount - (a.waitingCount + a.servingCount) || a.ticketPrefix.localeCompare(b.ticketPrefix),
  );
  const editing = queues.find((q) => q.id === editingId) ?? null;
  // With nobody in any lane the live columns would be a wall of zeros: hide them until there is traffic.
  const live = totals.waiting + totals.serving > 0;

  const openEditor = (q: BranchQueueDto) => {
    setEditingId(q.id);
    setDraft({ name: q.name, ticketPrefix: q.ticketPrefix, serviceLevelMinutes: q.serviceLevelMinutes, isActive: q.isActive });
    setPicks(q.serviceTypeIds ?? []);
  };
  const close = () => {
    setEditingId(null);
    setDraft(null);
  };

  /** One save: sends only what changed (lane settings and/or service assignment). */
  const save = async () => {
    if (!editing || !draft) return;
    const original = editing.serviceTypeIds ?? [];
    const settingsChanged =
      draft.name !== editing.name ||
      draft.ticketPrefix !== editing.ticketPrefix ||
      draft.serviceLevelMinutes !== editing.serviceLevelMinutes ||
      draft.isActive !== editing.isActive;
    const servicesChanged = picks.length !== original.length || picks.some((id) => !original.includes(id));
    if (settingsChanged) await onUpdate(editing.id, { ...draft });
    if (servicesChanged) await onSetServices(editing.id, picks);
    close();
  };

  const serviceLabels = (q: BranchQueueDto) => {
    const assigned = services.filter((s) => (q.serviceTypeIds ?? []).includes(s.id)).map((s) => s.name);
    return assigned.length > 0 ? assigned : (q.serviceNames ?? []);
  };

  return (
    <>
      <PageHeader
        title="Service Lanes"
        description={
          <>
            <strong>{totals.active} of {queues.length}</strong> lanes on
          </>
        }
      />

      <div className="m-stats">
        <StatCard label="Lanes on" icon={Layers} value={totals.active} unit={`/ ${queues.length}`} context={queues.length - totals.active > 0 ? `${queues.length - totals.active} off` : "All on"} />
        <StatCard label="Waiting" icon={Users} value={totals.waiting} context={totals.waiting === 0 ? "No one waiting" : "All lanes"} />
        <StatCard label="Serving" icon={UserRound} value={totals.serving} context={totals.serving === 0 ? "No one yet" : "At counters"} />
        <StatCard
          label="Waiting too long"
          icon={AlertTriangle}
          value={totals.breaches}
          badge={totals.breaches > 0 ? <Badge tone="danger" dot>Act now</Badge> : totals.waiting > 0 ? <Badge tone="success" dot>OK</Badge> : undefined}
          context={totals.breaches > 0 ? "Over lane target" : "No one"}
        />
      </div>

      <Card
        title="Lanes"
        description={
          undefined
        }
        action={!live && queues.length > 0 ? <Badge tone="neutral" dot>All quiet</Badge> : undefined}
        flush
      >
        {queues.length === 0 ? (
          <EmptyBlock icon={Layers} title="No lanes yet" body="Restart the server to create them." />
        ) : (
          <div className="m-table-wrap m-table-wrap--bordered">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Services</th>
                  <th className="m-num">Target</th>
                  {live ? (
                    <>
                      <th className="m-num">Waiting</th>
                      <th className="m-num">Serving</th>
                      <th className="m-num">Longest</th>
                    </>
                  ) : null}
                  <th>On</th>
                  <th style={{ width: 84 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((q) => {
                  const idle = q.waitingCount + q.servingCount === 0;
                  return (
                    <tr key={q.id} className={!q.isActive ? "is-muted" : undefined}>
                      <td>
                        <span className="m-cell-flex">
                          <span className={`m-token m-token--lg${idle ? " m-token--neutral" : ""}`}>{q.ticketPrefix}</span>
                          <span>
                            <span className="m-cell-main">{q.name}</span>
                            <span className="m-cell-sub">{q.isActive ? (idle ? "Idle" : "In use") : "Off"}</span>
                          </span>
                        </span>
                      </td>
                      <td><Chips items={serviceLabels(q)} max={2} empty={<Badge tone="warning" size="sm">No services</Badge>} /></td>
                      <td className="m-num">{q.serviceLevelMinutes} min</td>
                      {live ? (
                      <>
                      <td className="m-num"><span className={q.waitingCount > 0 ? "m-strong" : "m-subtle"}>{q.waitingCount}</span></td>
                      <td className="m-num"><span className={q.servingCount > 0 ? "m-strong" : "m-subtle"}>{q.servingCount ?? 0}</span></td>
                      <td className="m-num">
                        {q.longestWaitMinutes != null && q.waitingCount > 0 ? (
                          <span className={`m-wait m-wait--${(q.slaBreachCount ?? 0) > 0 ? "danger" : waitTone(q.longestWaitMinutes, q.serviceLevelMinutes)}`}>{q.longestWaitMinutes} min</span>
                        ) : (
                          <span className="m-subtle">—</span>
                        )}
                      </td>
                      </>
                      ) : null}
                      <td>
                        <label className="m-switch" title={q.isActive ? "Turn off" : "Turn on"}>
                          <input
                            type="checkbox"
                            checked={q.isActive}
                            disabled={busy}
                            onChange={(e) => void onUpdate(q.id, { isActive: e.target.checked })}
                            aria-label={`${q.name} active`}
                          />
                        </label>
                      </td>
                      <td className="m-num">
                        <button type="button" className="m-btn m-btn--ghost m-btn--sm" onClick={() => openEditor(q)} aria-label={`Edit ${q.name}`}>
                          <Pencil size={14} aria-hidden /> Edit
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
        open={editing != null && draft != null}
        title={editing ? `Edit lane ${editing.ticketPrefix}` : ""}
        description={editing ? editing.name : undefined}
        onClose={close}
        footer={
          <>
            <button type="button" className="m-btn m-btn--ghost" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className="m-btn m-btn--primary" onClick={() => void save()} disabled={busy}>Save</button>
          </>
        }
      >
        {editing && draft ? (
          <>
            <label className="m-field">
              <span className="m-field__label">Name</span>
              <input className="m-input" value={draft.name} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="m-form-grid m-form-grid--2">
              <label className="m-field">
                <span className="m-field__label">Ticket letter</span>
                <input className="m-input" maxLength={3} value={draft.ticketPrefix} disabled={busy} onChange={(e) => setDraft({ ...draft, ticketPrefix: e.target.value.toUpperCase() })} />
              </label>
              <label className="m-field">
                <span className="m-field__label">Target (min)</span>
                <input
                  className="m-input"
                  type="number"
                  min={1}
                  max={240}
                  value={draft.serviceLevelMinutes}
                  disabled={busy}
                  onChange={(e) => setDraft({ ...draft, serviceLevelMinutes: Number(e.target.value) || 15 })}
                />
              </label>
            </div>
            <label className="m-switch">
              <input type="checkbox" checked={draft.isActive} disabled={busy} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              Lane is on
            </label>
            <div className="m-drawer__section">
              <span className="m-drawer__section-title">Services</span>
              <span className="m-field__hint">Moving a service changes its letter.</span>
              <div className="m-check-list m-check-list--1">
                {services.map((s) => (
                  <label key={s.id} className="m-check">
                    <input
                      type="checkbox"
                      checked={picks.includes(s.id)}
                      disabled={busy}
                      onChange={(e) => setPicks(e.target.checked ? [...picks, s.id] : picks.filter((id) => id !== s.id))}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
