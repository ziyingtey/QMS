import type { ManagerInsights } from "../api";

type Props = {
  insights: ManagerInsights | null;
  onGoToCounter?: (counterId: string) => void;
  compact?: boolean;
};

function alertIcon(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical" || s === "error") return "⚠";
  if (s === "warning" || s === "warn") return "!";
  return "i";
}

export function ManagerAlertsPanel({ insights, onGoToCounter, compact = false }: Props) {
  if (!insights) {
    return <p className="qgo-muted">Alerts load when the branch has queue activity.</p>;
  }

  return (
    <div className={`qgo-mgr-alerts${compact ? " qgo-mgr-alerts--compact" : ""}`}>
      <div className="qgo-mgr-alerts__meta">
        <span>
          No-shows today: <strong>{insights.noShowsToday}</strong>
        </span>
      </div>

      {insights.alerts.length === 0 ? (
        <div className="qgo-mgr-alert-ok">
          <span className="qgo-mgr-alert-ok__icon" aria-hidden>
            ✓
          </span>
          <div>
            <strong>All clear</strong>
            <p className="qgo-muted">No active operational alerts.</p>
          </div>
        </div>
      ) : (
        <ul className="qgo-mgr-alert-list">
          {insights.alerts.map((a) => (
            <li key={a.message} className={`qgo-mgr-alert-card qgo-mgr-alert-card--${a.severity.toLowerCase()}`}>
              <span className="qgo-mgr-alert-card__icon" aria-hidden>
                {alertIcon(a.severity)}
              </span>
              <p>{a.message}</p>
            </li>
          ))}
        </ul>
      )}

      {!compact && (insights.suggestions ?? []).length > 0 ? (
        <>
          <h3 className="qgo-mgr-section-label">Suggested actions</h3>
          <ul className="qgo-mgr-suggestions">
            {(insights.suggestions ?? []).map((s) => (
              <li key={`${s.kind}-${s.title}`} className="qgo-mgr-suggestion">
                <div>
                  <strong>{s.title}</strong>
                  <p className="qgo-muted">{s.detail}</p>
                </div>
                {s.relatedCounterId && onGoToCounter ? (
                  <button type="button" className="qgo-btn-secondary qgo-btn-sm" onClick={() => onGoToCounter(s.relatedCounterId!)}>
                    View counter
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
