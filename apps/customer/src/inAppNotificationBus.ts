import type { Ionicons } from "@expo/vector-icons";

export type InAppNotificationPayload = {
  title: string;
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  onPress?: () => void;
};

type Handler = (payload: InAppNotificationPayload) => void;

let handler: Handler | null = null;

export function registerInAppNotificationHandler(next: Handler | null): void {
  handler = next;
}

/** Slide-down banner at top of screen (used when OS notification permission is unavailable). */
export function showInAppNotification(payload: InAppNotificationPayload): void {
  handler?.(payload);
}
