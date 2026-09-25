import { useMemo, useState } from "react";
import type { BranchDto, BranchQueueDto } from "../api";
import { KpiTile } from "../components/KpiTile";
import { EmptyState } from "../components/EmptyState";

type Props = {
  branch: BranchDto | undefined;
  queues: BranchQueueDto[];
  busy: boolean;
  onCreate: (input: { name: string; ticketPrefix: string; serviceLevelMinutes: number }) => Promise<void>;
  onUpdate: (
    queueId: string,
    patch: { name?: string; ticketPrefix?: string; serviceLevelMinutes?: number; isActive?: boolean },
  ) => Promise<void>;
  onSetServices: (queueId: string, serviceTypeIds: string[]) => Promise<void>;
};

export function ManagerQueuesTab({ branch, queues, busy, onCreate, onUpdate, onSetServices }: Props) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [sla, setSla] = useState(15);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; ticketPrefix: string; serviceLevelMinutes: number; isActive: boolean }>
  >({});
  const [servicePicks, setServicePicks] = useState<Record<string, string[]>>({});

  const services = branch?.services ?? [];

  const draftFor = (q: BranchQueueDto) =>
    drafts[q.id] ?? {
      name: q.name,
      ticketPrefix: q.ticketPrefix,
      serviceLevelMinutes: q.serviceLevelMinutes,
      isActive: q.isActive,
    };

  const picksFor = (q: BranchQueueDto) => servicePicks[q.id] ?? q.serviceTypeIds ?? [];

  const totals = useMemo(() => {
    const waiting = queues.reduce((a, q) => a + (q.waitingCount ?? 0), 0);
    const serving = queues.reduce((a, q) => a + (q.servingCount ?? 0), 0);
    const breaches = queues.reduce((a, q) => a + (q.slaBreachCount ?? 0), 0);
    return { waiting, serving, breaches };
  }, [queues]);

  return (
    <div className="qgo-mgr-queue-page">
      <header className="qgo-mgr-toolbar">
        <div>
          <h1>Queues</h1>
          <p className="qgo-muted">
            Bank-style service queues — letter prefix, SLA, and which services share a number series. Counters listen by
            enabling those services (work profile).
          </p>
        </div>
      </header>

      <div className="qgo-mgr-kpi-grid qgo-mgr-kpi-grid--compact">
        <KpiTile variant="manager" label="Queues" value={queues.length} foot="At this branch" accent="navy" />
        <KpiTile variant="manager" label="Waiting" value={totals.waiting} foot="All queues" accent="blue" />
        <KpiTile variant="manager" label="Serving" value={totals.serving} foot="At counters" accent="green" />
        <KpiTile variant="manager" label="Over SLA" value={totals.breaches} foot="Waiting too long" accent="amber" />
      </div>

      <section className="qgo-mgr-panel" style={{ marginTop: 16 }}>
        <header className="qgo-mgr-panel__head">
          <h2>Create queue</h2>
          <p className="qgo-muted">New letter series (e.g. C for Cards). Assign services below after create.</p>
        </header>
        <div className="qgo-transfer-row" style={{ padding: "0 16px 16px", flexWrap: "wrap" }}>
          <input
            placeholder="Name"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: "1 1 140px" }}
          />
          <input
            placeholder="Prefix"
            maxLength={3}
            value={prefix}
            disabled={busy}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            style={{ width: 72 }}
          />
          <input
            type="number"
            min={1}
            max={240}
            value={sla}
            disabled={busy}
            onChange={(e) => setSla(Number(e.target.value) || 15)}
            style={{ width: 88 }}
            title="SLA minutes"
          />
          <button
            type="button"
            className="qgo-btn-primary"
            disabled={busy || !prefix.trim()}
            onClick={() =>
              void onCreate({
                name: name.trim() || `Queue ${prefix.trim().toUpperCase()}`,
                ticketPrefix: prefix.trim(),
                serviceLevelMinutes: sla,
              }).then(() => {
                setName("");
                setPrefix("");
                setSla(15);
              })
            }
          >
            Create
          </button>
        </div>
      </section>

      {queues.length === 0 ? (
        <div style={{ padding: 32 }}>
          <EmptyState
            icon="inbox"
            title="No queues yet"
            body="Restart the API once to auto-provision one queue per service, or create queues here."
          />
        </div>
      ) : (
        <div className="qgo-floor-grid" style={{ marginTop: 16 }}>
          {queues.map((q) => {
            const d = draftFor(q);
            const picks = picksFor(q);
            return (
              <article key={q.id} className={`qgo-floor-card${q.isActive ? "" : " qgo-floor-card--closed"}`}>
                <div className="qgo-floor-card__header">
                  <div className="qgo-floor-card__num" aria-hidden>
                    {q.ticketPrefix}
                  </div>
                  <div className="qgo-floor-card__title">
                    <h3>{q.name}</h3>
                    <span className="qgo-muted">
                      {q.waitingCount} waiting · {q.servingCount ?? 0} serving
                      {q.longestWaitMinutes != null ? ` · longest ~${q.longestWaitMinutes}m` : ""}
                      {(q.slaBreachCount ?? 0) > 0 ? ` · ${q.slaBreachCount} over SLA` : ""}
                    </span>
                  </div>
                </div>

                <div className="qgo-floor-card__drawer" style={{ display: "grid", gap: 10 }}>
                  <label className="qgo-field">
                    <span>Name</span>
                    <input
                      value={d.name}
                      disabled={busy}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [q.id]: { ...d, name: e.target.value } }))
                      }
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label className="qgo-field" style={{ flex: 1 }}>
                      <span>Prefix</span>
                      <input
                        maxLength={3}
                        value={d.ticketPrefix}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [q.id]: { ...d, ticketPrefix: e.target.value.toUpperCase() },
                          }))
                        }
                      />
                    </label>
                    <label className="qgo-field" style={{ flex: 1 }}>
                      <span>SLA (min)</span>
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={d.serviceLevelMinutes}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [q.id]: { ...d, serviceLevelMinutes: Number(e.target.value) || 15 },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="qgo-check">
                    <input
                      type="checkbox"
                      checked={d.isActive}
                      disabled={busy}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [q.id]: { ...d, isActive: e.target.checked } }))
                      }
                    />
                    <span>Active (show on kiosks / walk-in later)</span>
                  </label>
                  <button
                    type="button"
                    className="qgo-btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void onUpdate(q.id, {
                        name: d.name,
                        ticketPrefix: d.ticketPrefix,
                        serviceLevelMinutes: d.serviceLevelMinutes,
                        isActive: d.isActive,
                      })
                    }
                  >
                    Save queue
                  </button>

                  <fieldset className="qgo-fieldset">
                    <legend>Services on this queue</legend>
                    <p className="qgo-muted" style={{ marginBottom: 8 }}>
                      Moving a service here changes its ticket letter. Tickets already waiting follow the new queue.
                    </p>
                    <div className="qgo-lane-picks">
                      {services.map((s) => (
                        <label key={s.id} className="qgo-check">
                          <input
                            type="checkbox"
                            checked={picks.includes(s.id)}
                            disabled={busy}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...picks, s.id]
                                : picks.filter((id) => id !== s.id);
                              setServicePicks((prev) => ({ ...prev, [q.id]: next }));
                            }}
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="qgo-btn-ghost"
                      style={{ marginTop: 8 }}
                      disabled={busy}
                      onClick={() => void onSetServices(q.id, picks)}
                    >
                      Save service assignment
                    </button>
                  </fieldset>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
