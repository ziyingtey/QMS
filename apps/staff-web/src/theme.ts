/** QGo staff ops — aligned with customer app navy + Grab green. */
export const theme = {
  navy: "#04336b",
  navyDark: "#032a57",
  green: "#00b14f",
  greenDark: "#00804a",
  greenSoft: "#d9fcde",
  teal: "#17b5a6",
  danger: "#d42e1c",
  warning: "#f09800",
  info: "#136fd8",
  bg: "#f5f7fa",
  surface: "#ffffff",
  border: "#e2e8f0",
  text: "#1a1a1a",
  textMuted: "#64748b",
  radius: "12px",
  radiusLg: "16px",
  shadow: "0 4px 24px rgba(4, 51, 107, 0.08)",
} as const;

export const counterModeColor: Record<string, string> = {
  active: theme.green,
  break: theme.warning,
  closed: "#94a3b8",
};
