import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import type { LocalNotificationData } from "./notificationsSetup";

type Options = {
  enabled: boolean;
  onOpenQueue?: (branchId: string, ticket: string, bookingId?: string) => void;
};

/** Routes taps on system/local notification banners to queue tracking. */
export function useNotificationTapHandler(opts: Options): void {
  const { enabled, onOpenQueue } = opts;

  useEffect(() => {
    if (!enabled || !onOpenQueue) return;

    const route = (data: LocalNotificationData | undefined) => {
      if (data?.type === "NextTurn" && data.branchId && data.ticketNumber) {
        onOpenQueue(data.branchId, data.ticketNumber, data.bookingId ?? undefined);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data as LocalNotificationData);
    });

    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (last) route(last.notification.request.content.data as LocalNotificationData);
    });

    return () => sub.remove();
  }, [enabled, onOpenQueue]);
}
