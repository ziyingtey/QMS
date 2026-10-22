import { useEffect, useRef } from "react";
import type { BranchDto } from "../api";
import { NAV_GROUPS, type ManagerTab } from "./managerNav";

type Props = {
  active: ManagerTab;
  onChange: (tab: ManagerTab) => void;
  branches: BranchDto[];
  branchId: string;
  onBranchChange?: (id: string) => void;
  branchOpen: boolean;
  alertCount: number;
  waitingCount: number;
};

/**
 * Manager sidebar — the original QGo look, kept as-is on purpose:
 * dark navy, green "Q" wordmark + MANAGER pill, branch card, DAILY OPS / SETTINGS / TOOLS groups,
 * active item = lighter navy pill with a blue left bar.
 */
export function ManagerSidebar({ active, onChange, branches, branchId, onBranchChange, branchOpen, alertCount, waitingCount }: Props) {
  const asideRef = useRef<HTMLElement>(null);
  const branch = branches.find((b) => b.id === branchId);

  // On narrow screens the sidebar is a horizontal tab strip: keep the active tab in view.
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside || aside.scrollWidth <= aside.clientWidth) return;
    const el = aside.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el) return;
    const delta = el.getBoundingClientRect().left - aside.getBoundingClientRect().left;
    aside.scrollTo({ left: aside.scrollLeft + delta - 16, behavior: "smooth" });
  }, [active]);

  return (
    <aside ref={asideRef} className="qgo-mgr-sidebar" aria-label="Branch manager navigation">
      <div className="qgo-mgr-sidebar__brand">
        <span className="qgo-mgr-sidebar__wordmark" aria-label="QGo">
          <span className="qgo-mgr-sidebar__wordmark-q">Q</span>Go
        </span>
        <span className="qgo-mgr-sidebar__product">Manager</span>
      </div>

      <div className="qgo-mgr-sidebar__branch">
        <span className="qgo-mgr-sidebar__branch-label">Branch</span>
        <strong className="qgo-mgr-sidebar__branch-name" title={branch?.name}>
          {branch?.name ?? "—"}
        </strong>
        <span className={`qgo-mgr-sidebar__status${branchOpen ? " is-open" : ""}`}>
          <span className="qgo-mgr-sidebar__status-dot" aria-hidden />
          {branchOpen ? "Open for operations" : "Outside hours"}
        </span>
        {/* Branch switching: an invisible native select over the card (only with several branches). */}
        {branches.length > 1 && onBranchChange ? (
          <select className="qgo-mgr-sidebar__branch-select" value={branchId} onChange={(e) => onBranchChange(e.target.value)} aria-label="Switch branch">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      <nav className="qgo-mgr-sidebar__nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="qgo-mgr-sidebar__group" role="group" aria-labelledby={`mgr-nav-${group.id}`}>
            <div className="qgo-mgr-sidebar__section-label" id={`mgr-nav-${group.id}`}>
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = active === item.id;
              const badge =
                item.id === "dashboard" && alertCount > 0
                  ? alertCount
                  : item.id === "queue" && waitingCount > 0
                    ? waitingCount
                    : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`qgo-mgr-sidebar__link${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onChange(item.id)}
                >
                  <item.Icon size={16} strokeWidth={2} className="qgo-mgr-sidebar__icon" aria-hidden />
                  <span className="qgo-mgr-sidebar__label">{item.label}</span>
                  {badge != null ? <span className="qgo-mgr-sidebar__badge">{badge}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
