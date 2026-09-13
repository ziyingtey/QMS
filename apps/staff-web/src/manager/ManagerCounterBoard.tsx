import type { AssignableStaffDto, ManagerCounterRowDto } from "../api";
import { counterModeKey, staffDisplayName } from "./managerUtils";

const STATUS_LABEL: Record<string, string> = {
  active: "Serving",
  break: "Break",
  closed: "Closed",
};

type Props = {
  rows: ManagerCounterRowDto[];
  staffPickList: AssignableStaffDto[];
  onSelect?: (counterId: string) => void;
};

export function ManagerCounterBoard({ rows, staffPickList, onSelect }: Props) {
  if (rows.length === 0) {
    return <p className="qgo-muted">No counters configured.</p>;
  }

  return (
    <ul className="qgo-mgr-counter-board">
      {rows.map((r) => {
        const mode = counterModeKey(r.mode);
        const teller = staffDisplayName(r, staffPickList);
        const lanes = r.allowedLanesDisplay === "— (assign lanes)" ? "No lanes" : r.allowedLanesDisplay;

        return (
          <li key={r.id}>
            <button
              type="button"
              className="qgo-mgr-counter-row"
              onClick={() => onSelect?.(r.id)}
              disabled={!onSelect}
            >
              <span className={`qgo-mgr-counter-row__dot qgo-mgr-counter-row__dot--${mode}`} aria-hidden />
              <div className="qgo-mgr-counter-row__main">
                <strong>Counter {r.number}</strong>
                <span className="qgo-mgr-counter-row__lanes">{lanes}</span>
              </div>
              <div className="qgo-mgr-counter-row__meta">
                <span className={`qgo-mgr-counter-row__status qgo-mgr-counter-row__status--${mode}`}>
                  {STATUS_LABEL[mode]}
                </span>
                <span className="qgo-mgr-counter-row__teller">{teller}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
