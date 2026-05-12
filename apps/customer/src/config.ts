/** Base URL of QMS.Api (no trailing slash). Use your machine LAN IP for a physical device. */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:5154";
