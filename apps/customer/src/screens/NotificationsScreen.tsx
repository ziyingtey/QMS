import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";
import { formatBookingSlotDateTime, defaultBranchOffsetMinutes } from "../utils/dateFormat";

type Props = NativeStackScreenProps<Record<string, undefined>, "Notifications">;

type Notification = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  time: string;
};

export function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { bookings, branches } = useCustomer();

  const notifications: Notification[] = useMemo(() => {
    const items: Notification[] = [];
    for (const b of bookings) {
      const branch = branches.find((br) => br.id === b.branchId);
      const off = branch?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
      const timeLine = formatBookingSlotDateTime(b.slotStart, b.slotEnd, off);
      const branchName = branch?.name ?? "Branch";

      if (b.status === "Confirmed") {
        items.push({
          id: `confirm-${b.id}`,
          icon: "checkmark-circle",
          iconColor: theme.success,
          title: "Booking Confirmed",
          body: `Your appointment at ${branchName} (${timeLine}) is confirmed. Please arrive 10 minutes early.`,
          time: "Today",
        });
      } else if (b.status === "Completed") {
        items.push({
          id: `complete-${b.id}`,
          icon: "checkmark-done-circle",
          iconColor: theme.primary,
          title: "Service Completed",
          body: `Your visit at ${branchName} (${timeLine}) has been completed. Thank you!`,
          time: "Today",
        });
      } else if (b.status === "Cancelled") {
        items.push({
          id: `cancel-${b.id}`,
          icon: "close-circle",
          iconColor: theme.danger,
          title: "Booking Cancelled",
          body: `Your appointment at ${branchName} (${timeLine}) was cancelled.`,
          time: "Today",
        });
      }
    }
    if (items.length === 0) {
      items.push({
        id: "welcome",
        icon: "notifications",
        iconColor: theme.primary,
        title: "Welcome to IH-QMS",
        body: "You will receive notifications about your queue status, appointment reminders, and branch updates here.",
        time: "",
      });
    }
    return items;
  }, [bookings, branches]);

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={theme.primaryDark} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: `${item.iconColor}20` }]}>
              <Ionicons name={item.icon} size={22} color={item.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
              {item.time ? <Text style={styles.cardTime}>{item.time}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, marginBottom: 16 },
  backBtn: { marginRight: 8 },
  title: { fontSize: 22, fontWeight: "900", color: theme.textOnLight },
  empty: { color: theme.textMutedOnLight, textAlign: "center", marginTop: 40 },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.textOnLight },
  cardBody: { fontSize: 13, color: theme.textMutedOnLight, marginTop: 4, lineHeight: 18 },
  cardTime: { fontSize: 11, color: theme.textMutedOnLight, marginTop: 6, fontWeight: "600" },
});
