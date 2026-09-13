import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { theme } from "../theme";

type Props = {
  variant?: "staff" | "manager";
  email: string | null;
  role: string | null;
  live?: boolean;
  onLogout: () => void;
  extra?: ReactNode;
};

export function AppTopBar({ variant = "staff", email, role, live = true, onLogout, extra }: Props) {
  const displayName = email?.split("@")[0] ?? "Staff";
  const initial = (displayName[0] ?? "?").toUpperCase();

  return (
    <header className={`qgo-topbar qgo-topbar--${variant}`}>
      <div className="qgo-topbar__brand">
        {variant === "manager" ? (
          <span className="qgo-topbar__wordmark" aria-label="QGo">
            <span className="qgo-topbar__wordmark-q">Q</span>Go
          </span>
        ) : (
          <img className="qgo-topbar__logo" src="/qgo-wordmark.png" alt="QGo" width={96} height={24} />
        )}
        {variant === "manager" ? <span className="qgo-topbar__badge">Manager</span> : null}
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
        {variant === "manager" ? (
          <Link to="/" className="qgo-link">
            Counter workspace
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
