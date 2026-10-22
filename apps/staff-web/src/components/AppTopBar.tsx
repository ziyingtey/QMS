import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { theme } from "../theme";

export type LiveStatus = "live" | "connecting" | "offline";

type Props = {
  variant?: "staff" | "manager";
  email: string | null;
  role: string | null;
  live?: boolean;
  /** Manager: real-time connection state. When set, overrides the `live` flag. */
  liveStatus?: LiveStatus;
  /** Manager: page title / breadcrumb shown on the left of the bar. */
  title?: ReactNode;
  onLogout: () => void;
  extra?: ReactNode;
};

const LIVE_LABEL: Record<LiveStatus, { text: string; title: string }> = {
  live: { text: "Live", title: "Live updates connected" },
  connecting: { text: "Connecting", title: "Connecting to live updates…" },
  offline: { text: "Offline", title: "Live updates disconnected — data refreshes periodically" },
};

function LivePill({ status }: { status: LiveStatus }) {
  const meta = LIVE_LABEL[status];
  return (
    <span className={`qgo-live-pill qgo-live-pill--${status}`} title={meta.title} role="status">
      <span className="qgo-live-dot" aria-hidden />
      <span className="qgo-live-pill__text">{meta.text}</span>
    </span>
  );
}

export function AppTopBar({ variant = "staff", email, role, live = true, liveStatus, title, onLogout, extra }: Props) {
  const displayName = email?.split("@")[0] ?? "Staff";
  const initial = (displayName[0] ?? "?").toUpperCase();

  if (variant === "manager") {
    return (
      <header className="qgo-topbar qgo-topbar--manager">
        <div className="qgo-topbar__lead">
          <span className="qgo-topbar__wordmark" aria-label="QGo">
            <span className="qgo-topbar__wordmark-q">Q</span>Go
          </span>
          {title ? <div className="qgo-topbar__title">{title}</div> : null}
        </div>
        <div className="qgo-topbar__actions">
          {extra}
          {liveStatus ? <LivePill status={liveStatus} /> : live ? <LivePill status="live" /> : null}
          <Link to="/" className="qgo-topbar__iconlink" title="Counter workspace">
            <MonitorSmartphone size={16} aria-hidden />
            <span className="qgo-topbar__iconlink-text">Counter workspace</span>
          </Link>
          <span className="qgo-topbar__divider" aria-hidden />
          <div className="qgo-user-chip" title={email ?? ""}>
            <span className="qgo-user-chip__avatar">{initial}</span>
            <span className="qgo-user-chip__name">{displayName}</span>
          </div>
          <button type="button" className="qgo-topbar__logout" onClick={() => void onLogout()} aria-label="Log out" title="Log out">
            <LogOut size={16} aria-hidden />
            <span className="qgo-topbar__logout-text">Log out</span>
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className={`qgo-topbar qgo-topbar--${variant}`}>
      <div className="qgo-topbar__brand">
        <img className="qgo-topbar__logo" src="/qgo-wordmark.png" alt="QGo" width={96} height={24} />
      </div>
      <div className="qgo-topbar__actions">
        {extra}
        {live ? (
          <span className="qgo-live-pill" title="Live updates connected">
            <span className="qgo-live-dot" /> Live
          </span>
        ) : null}
        {role === "Manager" ? (
          <Link to="/manager" className="qgo-link">
            Manager console
          </Link>
        ) : null}
        <div className="qgo-user-chip" title={email ?? ""}>
          <span className="qgo-user-chip__avatar" style={{ background: theme.navy }}>
            {initial}
          </span>
          <span className="qgo-user-chip__name">{displayName}</span>
        </div>
        <button type="button" className="qgo-btn-ghost" onClick={() => void onLogout()}>
          Log out
        </button>
      </div>
    </header>
  );
}
