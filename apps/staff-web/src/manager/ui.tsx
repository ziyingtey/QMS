/**
 * QGo Manager UI primitives (design system components).
 * Styling lives in styles/manager-ds.css; tokens in styles/manager-tokens.css.
 * Non-component helpers live in uiTones.ts (react-refresh: components only here).
 */
import { useEffect, type ReactNode } from "react";
import { CheckCircle2, Inbox, X, type LucideIcon } from "lucide-react";
import type { Tone } from "./uiTones";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Card ─────────────────────────────────────────────────────────────── */

export function Card({
  title,
  description,
  action,
  figure,
  figureLabel,
  footer,
  children,
  className,
  bodyClassName,
  flush = false,
  center = false,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Right side of the header (buttons, segmented control). */
  action?: ReactNode;
  /** Headline number shown at the top right of the header. */
  figure?: ReactNode;
  figureLabel?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Body without padding (tables and lists run edge to edge). */
  flush?: boolean;
  /** Vertically centre short content (sparse states). */
  center?: boolean;
  id?: string;
}) {
  const hasHead = title != null || action != null || figure != null;
  return (
    <section className={cx("m-card", className)} id={id}>
      {hasHead ? (
        <header className="m-card__head">
          <div className="m-card__titles">
            {title != null ? <h2 className="m-card__title">{title}</h2> : null}
            {description != null ? <p className="m-card__desc">{description}</p> : null}
          </div>
          {figure != null ? (
            <div className="m-card__figure">
              <strong>{figure}</strong>
              {figureLabel ? <span>{figureLabel}</span> : null}
            </div>
          ) : null}
          {action != null ? <div className="m-card__action">{action}</div> : null}
        </header>
      ) : null}
      {children != null ? (
        <div className={cx("m-card__body", flush && "m-card__body--flush", center && "m-card__body--center", bodyClassName)}>{children}</div>
      ) : null}
      {footer != null ? <footer className="m-card__foot">{footer}</footer> : null}
    </section>
  );
}

/* ── Stat card (KPI) ──────────────────────────────────────────────────── */

export function StatCard({
  label,
  icon: Icon,
  value,
  unit,
  badge,
  context,
  hint,
  visual,
  empty = false,
}: {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
  unit?: string;
  /** Top-right badge (status / trend). */
  badge?: ReactNode;
  /** First footer line: what the number means right now. */
  context?: ReactNode;
  /** Second footer line: muted detail. */
  hint?: ReactNode;
  visual?: ReactNode;
  /** Renders the value in a muted tone ("—" states). */
  empty?: boolean;
}) {
  return (
    <section className="m-card m-stat">
      <div className="m-stat__top">
        <span className="m-stat__label">
          {Icon ? <Icon size={15} strokeWidth={2} aria-hidden /> : null}
          {label}
        </span>
        {badge}
      </div>
      <div className="m-stat__value-row">
        {/* Zero counts and "—" render muted so an idle branch does not shout "0" everywhere. */}
        <span className={cx("m-stat__value", (empty || value === 0) && "m-stat__value--empty")}>
          {value}
          {unit && !empty ? <small>{unit}</small> : null}
        </span>
        {visual ? <span className="m-stat__visual">{visual}</span> : null}
      </div>
      {context != null || hint != null ? (
        <div className="m-stat__foot">
          {/* One secondary line only: the context, or the hint when there is no context. */}
          <span className="m-stat__context">{context ?? hint}</span>
        </div>
      ) : null}
    </section>
  );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

export function Badge({
  tone = "neutral",
  dot = false,
  size,
  icon: Icon,
  children,
  title,
}: {
  tone?: Tone | "outline";
  dot?: boolean;
  size?: "sm";
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={cx("m-badge", `m-badge--${tone}`, dot && "m-badge--dot", size === "sm" && "m-badge--sm")} title={title}>
      {Icon ? <Icon size={12} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </span>
  );
}

/* ── Segmented control / tabs ─────────────────────────────────────────── */

export type SegOption<T extends string> = {
  value: T;
  label: ReactNode;
  count?: number;
  tone?: "success" | "warning" | "neutral";
  disabled?: boolean;
  title?: string;
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size,
  label,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  size?: "sm";
  label: string;
}) {
  return (
    <div className={cx("m-seg", size === "sm" && "m-seg--sm")} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx("m-seg__item", o.value === value && "is-active", o.tone && `m-seg__item--${o.tone}`)}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null ? <span className="m-seg__count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ── Page header ──────────────────────────────────────────────────────── */

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="m-page-head">
      <div className="m-page-head__text">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="m-page-head__actions">{actions}</div> : null}
    </header>
  );
}

/* ── Empty / note / skeleton ──────────────────────────────────────────── */

export function EmptyBlock({
  icon: Icon = Inbox,
  title,
  body,
  action,
  inline = false,
  positive = false,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  inline?: boolean;
  /** Green "all clear" variant. */
  positive?: boolean;
}) {
  const ShownIcon = positive && Icon === Inbox ? CheckCircle2 : Icon;
  return (
    <div className={cx("m-empty", inline && "m-empty--inline")}>
      <span className={cx("m-empty__icon", positive && "m-empty__icon--success")}>
        <ShownIcon size={18} strokeWidth={2} aria-hidden />
      </span>
      {inline ? (
        <span className="m-empty__text">
          <span className="m-empty__title">{title}</span>
          {body ? <span className="m-empty__body">{body}</span> : null}
        </span>
      ) : (
        <>
          <span className="m-empty__title">{title}</span>
          {body ? <span className="m-empty__body">{body}</span> : null}
        </>
      )}
      {action ? <div className="m-empty__action">{action}</div> : null}
    </div>
  );
}

/**
 * "N waiting too long" badge for stat cards. In a narrow card it switches to "Too long: N"
 * (container query on .m-stat) so the card label is never squeezed.
 */
export function TooLongBadge({ count }: { count: number }) {
  return (
    <Badge tone="danger" dot>
      <span className="m-toolong--full">{count} waiting too long</span>
      <span className="m-toolong--short">Too long: {count}</span>
    </Badge>
  );
}

/** One-line message used instead of a chart when there is too little data. */
export function Note({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m-note">
      <div className="m-note__text">
        <span className="m-note__msg">{children}</span>
        {hint ? <span className="m-note__hint">{hint}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 14, radius }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="m-skel" style={{ width, height, borderRadius: radius }} aria-hidden />;
}

/** Placeholder page body while data loads: stat row + one large card. */
export function PageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="m-stack m-stack--lg" aria-busy="true" aria-label="Loading">
      <div className={cx("m-stats", stats === 5 && "m-stats--5")}>
        {Array.from({ length: stats }, (_, i) => (
          <section key={i} className="m-card m-stat">
            <Skeleton width={90} height={12} />
            <Skeleton width={70} height={28} />
            <Skeleton width="70%" height={12} />
          </section>
        ))}
      </div>
      <section className="m-card">
        <div className="m-card__body m-stack">
          <Skeleton width={160} height={16} />
          <Skeleton height={180} radius={8} />
        </div>
      </section>
    </div>
  );
}

/* ── Meter ────────────────────────────────────────────────────────────── */

export function Meter({ percent, tone }: { percent: number; tone?: "success" | "warning" | "danger" }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <span className={cx("m-meter", tone && `m-meter--${tone}`)} role="presentation">
      <span className="m-meter__fill" style={{ width: `${w}%` }} />
    </span>
  );
}

/* ── Drawer (side sheet) ──────────────────────────────────────────────── */

export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="m-drawer-overlay" onClick={onClose} aria-hidden />
      <aside className="m-drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <header className="m-drawer__head">
          <div className="m-drawer__titles">
            <h2 className="m-drawer__title">{title}</h2>
            {description ? <p className="m-drawer__desc">{description}</p> : null}
          </div>
          <button type="button" className="m-btn m-btn--ghost m-btn--icon m-btn--sm" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="m-drawer__body">{children}</div>
        {footer ? <footer className="m-drawer__foot">{footer}</footer> : null}
      </aside>
    </>
  );
}

/* ── Chips ────────────────────────────────────────────────────────────── */

export function Chips({ items, max = 3, empty }: { items: string[]; max?: number; empty?: ReactNode }) {
  if (items.length === 0) return <>{empty ?? <span className="m-muted">—</span>}</>;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className="m-chips" title={items.join(", ")}>
      {shown.map((n) => (
        <span key={n} className="m-chip">{n}</span>
      ))}
      {rest > 0 ? <span className="m-chip m-chip--more">+{rest}</span> : null}
    </span>
  );
}
