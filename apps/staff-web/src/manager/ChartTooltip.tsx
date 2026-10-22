/** Minimal subset of recharts' TooltipContentProps that this card reads. */
type TooltipEntry = {
  value?: unknown;
  name?: unknown;
  color?: string;
  dataKey?: unknown;
  payload?: unknown;
};

type Props = {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<TooltipEntry>;
  /** Suffix appended to every value, e.g. " tickets". */
  unit?: string;
  /** Formats the header label (x-axis category). */
  formatLabel?: (label: unknown) => string;
  /** Formats each value. Overrides `unit`. */
  formatValue?: (value: number) => string;
  /** Optional extra muted lines under the values (built from the hovered datum). */
  extra?: (datum: Record<string, unknown>) => string[];
};

/** Small card tooltip shared by every analytics chart (matches the 1px #e6e8ee card style). */
export function ChartTooltip({ active, payload, label, unit = "", formatLabel, formatValue, extra }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const lines = extra ? extra(datum) : [];
  return (
    <div className="m-chart-tip">
      {label != null && label !== "" ? (
        <div className="m-chart-tip__label">{formatLabel ? formatLabel(label) : String(label)}</div>
      ) : null}
      {payload.map((p, i) => {
        const value = typeof p.value === "number" ? p.value : Number(p.value);
        const color = (p.payload as { tone?: string } | undefined)?.tone ?? p.color ?? "#1d4ed8";
        return (
          <div key={`${String(p.dataKey)}-${i}`} className="m-chart-tip__row">
            <span className="m-chart-tip__dot" style={{ background: color }} aria-hidden />
            <span className="m-chart-tip__name">{String(p.name ?? "")}</span>
            <strong>{formatValue ? formatValue(value) : `${value}${unit}`}</strong>
          </div>
        );
      })}
      {lines.map((l) => (
        <div key={l} className="m-chart-tip__extra">{l}</div>
      ))}
    </div>
  );
}
