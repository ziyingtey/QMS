import { LayoutDashboard, Monitor, Clock, BarChart3 } from "lucide-react";

export type ManagerTab = "dashboard" | "counters" | "capacity" | "analytics";

type Props = {
  active: ManagerTab;
  onChange: (tab: ManagerTab) => void;
  branchName?: string;
  branchOpen: boolean;
  alertCount: number;
};

const NAV: { id: ManagerTab; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "counters", label: "Counters", Icon: Monitor },
  { id: "capacity", label: "Schedule & capacity", Icon: Clock },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
];

export function ManagerSidebar({ active, onChange, branchName, branchOpen, alertCount }: Props) {
  return (
    <aside className="qgo-mgr-sidebar" aria-label="Branch manager navigation">
      <div className="qgo-mgr-sidebar__branch">
        <span className="qgo-mgr-sidebar__branch-label">Branch</span>
        <strong className="qgo-mgr-sidebar__branch-name" title={branchName}>
          {branchName ?? "—"}
        </strong>
        <span className={`qgo-mgr-sidebar__status${branchOpen ? " is-open" : ""}`}>
          <span className="qgo-live-dot" aria-hidden />
          {branchOpen ? "Open for operations" : "Outside hours"}
        </span>
      </div>

      <nav className="qgo-mgr-sidebar__nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`qgo-mgr-sidebar__link${active === item.id ? " is-active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <item.Icon size={18} strokeWidth={2.2} className="qgo-mgr-sidebar__icon" aria-hidden />
            <span>{item.label}</span>
            {item.id === "analytics" && alertCount > 0 ? (
              <span className="qgo-mgr-sidebar__badge">{alertCount}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <p className="qgo-mgr-sidebar__foot">Branch operations & decision support</p>
    </aside>
  );
}
