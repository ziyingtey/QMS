/** Manager console navigation model (shared by sidebar + top bar breadcrumb). */
import { BarChart3, CalendarCheck, Clock, Layers, LayoutDashboard, ListOrdered, Monitor, QrCode } from "lucide-react";

export type ManagerTab = "dashboard" | "counters" | "queue" | "queues" | "appointments" | "capacity" | "analytics" | "qr";

export type NavItem = { id: ManagerTab; label: string; Icon: typeof LayoutDashboard };

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "daily-ops",
    label: "Daily ops",
    items: [
      { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
      { id: "queue", label: "Live Monitor", Icon: ListOrdered },
      { id: "appointments", label: "Appointments", Icon: CalendarCheck },
      { id: "analytics", label: "Analytics", Icon: BarChart3 },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { id: "counters", label: "Counters", Icon: Monitor },
      { id: "queues", label: "Service Lanes", Icon: Layers },
      { id: "capacity", label: "Schedule & Capacity", Icon: Clock },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [{ id: "qr", label: "Walk-in QR", Icon: QrCode }],
  },
];

export const ALL_TABS: ManagerTab[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** Section + page label for the top bar breadcrumb. */
export function managerTabMeta(tab: ManagerTab): { group: string; label: string } {
  for (const g of NAV_GROUPS) {
    const item = g.items.find((i) => i.id === tab);
    if (item) return { group: g.label, label: item.label };
  }
  return { group: "", label: "" };
}
