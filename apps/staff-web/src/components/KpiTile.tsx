type Props = {
  label: string;
  value: string | number;
  foot?: string;
  accent?: "green" | "blue" | "amber" | "navy";
  variant?: "default" | "manager";
};

export function KpiTile({ label, value, foot, accent = "green", variant = "default" }: Props) {
  return (
    <div className={`qgo-kpi${variant === "manager" ? " qgo-kpi--manager" : ""}`}>
      <div className={`qgo-kpi__accent qgo-kpi__accent--${accent}`} />
      <div className="qgo-kpi__body">
        <div className="qgo-kpi__label">{label}</div>
        <div className="qgo-kpi__value">{value}</div>
        {foot ? <div className="qgo-kpi__foot">{foot}</div> : null}
      </div>
    </div>
  );
}
