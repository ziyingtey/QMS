import { AlertCircle, CalendarDays, CheckCircle, Inbox } from "lucide-react";
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

