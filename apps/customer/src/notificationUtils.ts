import type { CustomerNotificationDto } from "./api";
import { theme } from "./theme";

export type NotificationPresentation = {
  title: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  iconColor: string;
};

export function presentationForNotification(n: CustomerNotificationDto): NotificationPresentation {
  switch (n.type) {
    case "NextTurn":
      return { title: "It's your turn", icon: "megaphone", iconColor: theme.success };
    case "Missed":
      return { title: "Ticket missed", icon: "alert-circle", iconColor: theme.danger };
    case "BookingCancelled":
      return { title: "Booking cancelled", icon: "close-circle", iconColor: theme.danger };
    case "Overcrowding":
      return { title: "High crowd", icon: "people", iconColor: "#f09800" };
    case "Delay":
      return { title: "Queue delay", icon: "time", iconColor: "#f09800" };
    case "Reminder":
    default:
      return { title: "Booking update", icon: "notifications", iconColor: theme.primary };
  }
}

export function formatNotificationTime(sentAt: string): string {
  if (!sentAt) return "";
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return sentAt;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
