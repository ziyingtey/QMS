type Props = {
  mode: string;
  size?: "sm" | "md";
};

export function StatusPill({ mode, size = "md" }: Props) {
  const key = mode.toLowerCase();
  return (
    <span className={`qgo-status-pill qgo-status-pill--${key} qgo-status-pill--${size}`}>{mode}</span>
  );
}
