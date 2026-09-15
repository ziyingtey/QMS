import { CheckCircle, Inbox, AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  body?: string;
  icon?: "check" | "inbox" | "alert" | ReactNode;
  action?: ReactNode;
};

const ICON_MAP: Record<string, typeof CheckCircle> = {
  check: CheckCircle,
  inbox: Inbox,
  alert: AlertCircle,
};

export function EmptyState({ title, body, icon = "inbox", action }: Props) {
  const IconComp = typeof icon === "string" ? ICON_MAP[icon] ?? null : null;

  return (
    <div className="qgo-empty">
      <div className="qgo-empty__icon" aria-hidden>
        {IconComp ? <IconComp size={40} strokeWidth={1.5} /> : icon}
      </div>
      <div className="qgo-empty__title">{title}</div>
      {body ? <p className="qgo-empty__body">{body}</p> : null}
      {action ? <div className="qgo-empty__action">{action}</div> : null}
    </div>
  );
}
