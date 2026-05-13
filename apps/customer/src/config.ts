/** Base URL of QMS.Api (no trailing slash). Set EXPO_PUBLIC_API_URL for phones / another PC. */
import { Platform } from "react-native";

function normalizeApiBase(raw: string | undefined): string | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  return String(raw)
    .trim()
    .replace(/\r?\n/g, "")
    .replace(/\/$/, "");
}

/** Android emulator → host is 10.0.2.2, not 127.0.0.1. */
const defaultApiBase =
  Platform.OS === "android" ? "http://10.0.2.2:5154" : "http://127.0.0.1:5154";

/** On Android native, localhost is the device — map to host for dev (unless you use adb reverse). */
function rewriteLocalhostForAndroid(base: string): string {
  if (Platform.OS !== "android") return base;
  try {
    const u = new URL(base);
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
      u.hostname = "10.0.2.2";
      return u.toString().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return base;
}

const resolved = normalizeApiBase(process.env.EXPO_PUBLIC_API_URL) ?? defaultApiBase;
export const API_BASE = rewriteLocalhostForAndroid(resolved);
