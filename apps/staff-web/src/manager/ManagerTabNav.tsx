type Tab = "counters" | "capacity" | "queue";

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
};

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "counters", label: "Live floor", desc: "Counters & tellers" },
  { id: "capacity", label: "Schedule", desc: "Hours & quotas" },
  { id: "queue", label: "Analytics", desc: "Queues & alerts" },
];

export function ManagerTabNav({ active, onChange }: Props) {
  return (
    <nav className="qgo-mgr-tabs" aria-label="Manager sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`qgo-mgr-tabs__btn${active === t.id ? " is-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          <span className="qgo-mgr-tabs__label">{t.label}</span>
          <span className="qgo-mgr-tabs__desc">{t.desc}</span>
        </button>
      ))}
    </nav>
  );
}
