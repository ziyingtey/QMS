import { AlertCircle, CalendarDays, CheckCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type IconKey = "check" | "inbox" | "alert" | "calendar";

type Props = {
  title: string;
  body?: string;
  icon?: IconKey | ReactNode;
  action?: ReactNode;
  /** Smaller padding/icon for use inside panels. */
  compact?: boolean;
};

const ICON_MAP: Record<IconKey, typeof CheckCircle> = {
  check: CheckCircle,
  inbox: Inbox,
  alert: AlertCircle,
  calendar: CalendarDays,
};

function isIconKey(v: unknown): v is IconKey {
  return typeof v === "string" && v in ICON_MAP;
}

export function EmptyState({ title, body, icon = "inbox", action, compact = false }: Props) {
  // Unknown string keys render no icon (never print the key as text).
  const IconComp = isIconKey(icon) ? ICON_MAP[icon] : null;
  const custom = typeof icon === "string" ? null : icon;

  return (
    <div className={`qgo-empty${compact ? " qgo-empty--compact" : ""}`}>
      {IconComp || custom ? (
        <div className="qgo-empty__icon" aria-hidden>
          {IconComp ? <IconComp size={compact ? 28 : 36} strokeWidth={1.6} /> : custom}
        </div>
      ) : null}
      <div className="qgo-empty__title">{title}</div>
      {body ? <p className="qgo-empty__body">{body}</p> : null}
      {action ? <div className="qgo-empty__action">{action}</div> : null}
    </div>
  );
}

/** Neutral loading placeholder (spinner + label, optional skeleton lines). */
export function LoadingState({ label = "Loading…", lines = 0 }: { label?: string; lines?: number }) {
  return (
    <div className="qgo-state qgo-state--loading" role="status" aria-live="polite">
      <div className="qgo-state__row">
        <Loader2 size={16} className="qgo-spin" aria-hidden />
        <span>{label}</span>
      </div>
      {lines > 0 ? (
        <div className="qgo-skeleton-lines" aria-hidden>
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className="qgo-skeleton" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Skeleton KPI cards shown while the first snapshot loads. */
export function KpiSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="qgo-mgr-kpi-grid" role="status" aria-label="Loading metrics">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="qgo-kpi qgo-kpi--manager qgo-kpi--skeleton" aria-hidden>
          <span className="qgo-skeleton qgo-skeleton--label" />
          <span className="qgo-skeleton qgo-skeleton--value" />
          <span className="qgo-skeleton qgo-skeleton--foot" />
        </div>
      ))}
    </div>
  );
}

/** Error / unavailable state. */
export function ErrorState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="qgo-state qgo-state--error" role="alert">
      <AlertCircle size={20} aria-hidden />
      <div>
        <strong>{title}</strong>
        {body ? <p>{body}</p> : null}
        {action ? <div className="qgo-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
