import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string | number;
  foot?: string;
  accent?: "green" | "blue" | "amber" | "navy" | "red";
  variant?: "default" | "manager" | "hero";
  /** Optional icon (manager variant shows it in a tinted badge). */
  icon?: ReactNode;
};

export function KpiTile({ label, value, foot, accent = "green", variant = "default", icon }: Props) {
  const cls = [
    "qgo-kpi",
    variant === "manager" ? "qgo-kpi--manager" : "",
    variant === "hero" ? "qgo-kpi--hero" : "",
    `qgo-kpi--accent-${accent}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className={`qgo-kpi__accent qgo-kpi__accent--${accent}`} />
      <div className="qgo-kpi__body">
        <div className="qgo-kpi__label">
          {icon ? (
            <span className="qgo-kpi__icon" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span>{label}</span>
        </div>
        <div className="qgo-kpi__value">{value}</div>
        {foot ? <div className="qgo-kpi__foot">{foot}</div> : null}
      </div>
    </div>
  );
}
