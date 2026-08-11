import * as signalR from "@microsoft/signalr";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { API_BASE } from "./config";
import type { CustomerNotificationDto } from "./api";
import { showInAppNotification } from "./inAppNotificationBus";
import { presentationForNotification } from "./notificationUtils";
import { presentLocalNotification } from "./notificationsSetup";

type Options = {
  enabled: boolean;
  accessToken: string | null;
  onIncoming: (notification: CustomerNotificationDto) => void;
  onOpenQueue?: (branchId: string, ticket: string, bookingId?: string) => void;
};

async function showForegroundBanner(
  n: CustomerNotificationDto,
  onOpenQueue?: Options["onOpenQueue"],
): Promise<void> {
  const { title, icon, iconColor } = presentationForNotification(n);
  const canOpenQueue = n.type === "NextTurn" && n.branchId && n.ticketNumber && onOpenQueue;
  const openQueue = canOpenQueue
    ? () => onOpenQueue!(n.branchId!, n.ticketNumber!, n.bookingId ?? undefined)
    : undefined;

  try {
    await presentLocalNotification(title, n.message, {
      type: n.type,
      branchId: n.branchId,
      ticketNumber: n.ticketNumber,
      bookingId: n.bookingId,
    });
  } catch {
    showInAppNotification({
      title,
      message: n.message,
      icon,
      iconColor,
      onPress: openQueue,
    });
  }
}

/**
 * Subscribes to customer-specific SignalR group for live top-of-screen notification banners.
 */
export function useCustomerNotifications(opts: Options): void {
  const { enabled, accessToken, onIncoming, onOpenQueue } = opts;
  const incomingRef = useRef(onIncoming);
  const openQueueRef = useRef(onOpenQueue);
  incomingRef.current = onIncoming;
  openQueueRef.current = onOpenQueue;

  useEffect(() => {
    if (!enabled || !accessToken) return;

    const qs = `?access_token=${encodeURIComponent(accessToken)}`;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/queue${qs}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.None)
      .build();

    conn.on("NewNotification", (raw: Record<string, unknown>) => {
      const n: CustomerNotificationDto = {
        id: String(raw.id ?? raw.Id ?? ""),
        type: String(raw.type ?? raw.Type ?? "Reminder"),
        message: String(raw.message ?? raw.Message ?? ""),
        bookingId: raw.bookingId != null ? String(raw.bookingId) : raw.BookingId != null ? String(raw.BookingId) : null,
        sentAt: String(raw.sentAt ?? raw.SentAt ?? ""),
        isRead: Boolean(raw.isRead ?? raw.IsRead ?? false),
        ticketNumber:
          raw.ticketNumber != null ? String(raw.ticketNumber) : raw.TicketNumber != null ? String(raw.TicketNumber) : null,
        branchId: raw.branchId != null ? String(raw.branchId) : raw.BranchId != null ? String(raw.BranchId) : null,
      };
      incomingRef.current(n);
      if (AppState.currentState === "active") {
        void showForegroundBanner(n, openQueueRef.current);
      }
    });

    let cancelled = false;
    void (async () => {
      try {
        await conn.start();
        if (cancelled) return;
        await conn.invoke("WatchCustomer");
      } catch (e) {
        console.warn("[QMS] customer notifications SignalR:", e);
      }
    })();

    return () => {
      cancelled = true;
      void conn.stop();
    };
  }, [enabled, accessToken]);
}
