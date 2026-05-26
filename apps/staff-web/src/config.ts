/**
 * REST + SignalR base URL.
 * In dev with `VITE_DEV_USE_PROXY=true`, use same-origin URLs so Vite can forward `/api` and `/hubs`
 * to `VITE_DEV_API_PROXY_TARGET` (fixes browsers that cannot reach the API host directly).
 */
const trimmed = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") ?? "";
const useDevProxy = import.meta.env.DEV && import.meta.env.VITE_DEV_USE_PROXY === "true";
export const API_BASE = useDevProxy ? "" : trimmed || "http://127.0.0.1:5154";
