import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let configured = false;

/** Allow foreground banners + sound for local notifications (Android heads-up / iOS banner). */
export async function ensureNotificationsConfigured(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("queue-updates", {
      name: "Queue updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 120, 80, 120],
      lightColor: themePrimary(),
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  }
}

function notificationPermissionGranted(perm: Notifications.NotificationPermissionsStatus): boolean {
  const p = perm as Notifications.NotificationPermissionsStatus & { status?: string };
  if (p.status === "granted") return true;
  const iosStatus = p.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (notificationPermissionGranted(current)) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return notificationPermissionGranted(req);
}

function themePrimary(): string {
  return "#1e4a8c";
}

export type LocalNotificationData = {
  type?: string;
  branchId?: string | null;
  ticketNumber?: string | null;
  bookingId?: string | null;
};

export async function presentLocalNotification(
  title: string,
  body: string,
  data?: LocalNotificationData,
): Promise<void> {
  await ensureNotificationsConfigured();

  const allowed = await ensureNotificationPermission();
  if (!allowed) {
    throw new Error("notification permission denied");
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: true,
      ...(Platform.OS === "android" ? { channelId: "queue-updates" } : {}),
    },
    trigger: null,
  });
}
