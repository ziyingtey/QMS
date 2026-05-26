import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = (env.VITE_DEV_API_PROXY_TARGET || env.VITE_API_URL || "http://127.0.0.1:5154").replace(/\/$/, "");
  const useProxy = env.VITE_DEV_USE_PROXY === "true";

  return {
    plugins: [react()],
    server: useProxy
      ? {
          proxy: {
            "/api": { target: proxyTarget, changeOrigin: true },
            "/hubs": { target: proxyTarget, ws: true, changeOrigin: true },
          },
        }
      : undefined,
  };
});
