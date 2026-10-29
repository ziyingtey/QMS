import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogOut, MonitorSmartphone } from "lucide-react";
import type { BranchDto } from "../api";
import type { LiveStatus } from "../components/AppTopBar";
import { ManagerSidebar } from "./ManagerSidebar";
import { managerTabMeta, type ManagerTab } from "./managerNav";
import { initialsOf } from "./uiTones";
import { formatMyTime } from "../malaysiaTime";

type Props = {
  tab: ManagerTab;
  onTabChange: (tab: ManagerTab) => void;
  branches: BranchDto[];
  branchId: string;
  onBranchChange?: (id: string) => void;
  branchOpen: boolean;
  alertCount: number;
  waitingCount: number;
  email: string | null;
  onLogout: () => void;
  liveStatus: LiveStatus;
  /** Optional banner above the shell (preview mode). */
  banner?: ReactNode;
  children: ReactNode;
};

const LIVE_LABEL: Record<LiveStatus, string> = { live: "Live", connecting: "Reconnecting", offline: "Offline" };

/** Manager console frame: dark sidebar + inset content panel with a compact top bar. */
export function ManagerShell({
  tab,
  onTabChange,
  branches,
  branchId,
  onBranchChange,
  branchOpen,
  alertCount,
  waitingCount,
  email,
  onLogout,
  liveStatus,
  banner,
  children,
}: Props) {
  const meta = managerTabMeta(tab);
  // Each page starts at the top; otherwise the previous page's scroll hides the new title under the sticky top bar.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);
  const now = formatMyTime(new Date());
  return (
    <div className="mds">
      {banner}
      <div className="mds-layout">
        <ManagerSidebar
          active={tab}
          onChange={onTabChange}
          branches={branches}
          branchId={branchId}
          onBranchChange={onBranchChange}
          branchOpen={branchOpen}
          alertCount={alertCount}
          waitingCount={waitingCount}
        />
        <div className="mds-main">
          <header className="m-topbar">
            <nav className="m-crumbs" aria-label="Breadcrumb">
              <span className="m-crumbs__group">{meta.group}</span>
              <span className="m-crumbs__sep" aria-hidden>/</span>
              <span className="m-crumbs__page" aria-current="page">{meta.label}</span>
            </nav>
            <div className="m-topbar__right">
              <span className="m-topbar__time" title="Data refreshes automatically">Updated {now}</span>
              <span className={`m-live m-live--${liveStatus}`} role="status">
                <span className={`m-dot ${liveStatus === "live" ? "m-dot--success" : liveStatus === "offline" ? "m-dot--danger" : "m-dot--warning"}`} aria-hidden />
                {LIVE_LABEL[liveStatus]}
              </span>
              <span className="m-vsep" aria-hidden />
              <Link to="/" className="m-btn m-btn--ghost m-btn--sm">
                <MonitorSmartphone size={15} aria-hidden />
                Counter workspace
              </Link>
              <span className="m-topbar__user" title={email ?? undefined}>
                <span className="m-avatar m-avatar--sm" aria-hidden>{initialsOf(email)}</span>
              </span>
              <button type="button" className="m-btn m-btn--ghost m-btn--icon m-btn--sm" onClick={onLogout} title="Sign out" aria-label="Sign out">
                <LogOut size={15} aria-hidden />
              </button>
            </div>
          </header>
          <main className="mds-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
