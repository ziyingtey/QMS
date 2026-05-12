import * as signalR from "@microsoft/signalr";
import { useEffect, useRef } from "react";
import { API_BASE } from "./config";

type Options = {
  branchIds: string[];
  enabled: boolean;
  accessToken: string | null;
  onEvent: () => void;
};

/**
 * Subscribes to branch queue groups. Works with or without JWT (walk-ins use anonymous).
 */
export function useBranchRealtime(opts: Options): void {
  const { branchIds, enabled, accessToken, onEvent } = opts;
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;
  const key = branchIds.slice().sort().join("|");

  useEffect(() => {
    if (!enabled || branchIds.length === 0) return;

    const qs = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue${qs}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    const fire = () => cbRef.current();
    conn.on("QueueUpdated", fire);
    conn.on("TicketCalled", fire);
    conn.on("CountersUpdated", fire);

    let cancelled = false;
    void (async () => {
      try {
        await conn.start();
        if (cancelled) return;
        for (const id of branchIds) {
          const gid = id;
          await conn.invoke("WatchBranch", gid);
        }
      } catch (e) {
        console.warn("[QMS] SignalR:", e);
      }
    })();

    return () => {
      cancelled = true;
      void conn.stop();
    };
  }, [enabled, accessToken, key]);
}
