import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  apiListNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  type CustomerNotificationDto,
} from "../api";
import { useCustomer } from "../context/CustomerContext";
import { formatNotificationTime, presentationForNotification } from "../notificationUtils";
import { theme } from "../theme";

type Props = NativeStackScreenProps<Record<string, undefined>, "Notifications">;

export function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { refreshUnreadNotificationCount, navigateToQueueTrack } = useCustomer();
  const [items, setItems] = useState<CustomerNotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await apiListNotifications());
      await refreshUnreadNotificationCount();
    } catch {
      /* keep previous list */
    }
  }, [refreshUnreadNotificationCount]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onMarkAllRead = useCallback(async () => {
    if (markingAll || items.every((n) => n.isRead)) return;
    setMarkingAll(true);
    try {
      await apiMarkAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await refreshUnreadNotificationCount();
    } finally {
      setMarkingAll(false);
    }
  }, [items, markingAll, refreshUnreadNotificationCount]);

  const onTap = useCallback(
    async (n: CustomerNotificationDto) => {
      if (!n.isRead) {
        try {
          await apiMarkNotificationRead(n.id);
          setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
          await refreshUnreadNotificationCount();
        } catch {
          /* ignore */
        }
      }
      if (n.type === "NextTurn" && n.branchId && n.ticketNumber) {
        navigateToQueueTrack(n.branchId, n.ticketNumber, n.bookingId ?? undefined);
      }
    },
    [navigateToQueueTrack, refreshUnreadNotificationCount],
  );

  const hasUnread = items.some((n) => !n.isRead);

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={theme.primaryDark} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        {hasUnread ? (
          <Pressable onPress={() => void onMarkAllRead()} hitSlop={8} disabled={markingAll} style={styles.markAllBtn}>
            {markingAll ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={styles.markAllText}>Mark all read</Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.markAllPlaceholder} />
        )}
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={48} color={theme.textMutedOnLight} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyBody}>
                Booking updates, queue calls, and reminders will appear here — like your bank app inbox.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const { title, icon, iconColor } = presentationForNotification(item);
            return (
              <Pressable
                onPress={() => void onTap(item)}
                style={[styles.card, !item.isRead && styles.cardUnread]}
              >
                <View style={[styles.iconCircle, { backgroundColor: `${iconColor}20` }]}>
                  <Ionicons name={icon} size={22} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}>{title}</Text>
                    {!item.isRead ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.cardBody}>{item.message}</Text>
                  <Text style={styles.cardTime}>{formatNotificationTime(item.sentAt)}</Text>
                </View>
                {item.type === "NextTurn" ? (
                  <Ionicons name="chevron-forward" size={18} color={theme.textMutedOnLight} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  backBtn: { marginRight: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: "900", color: theme.textOnLight },
  markAllBtn: { minWidth: 88, alignItems: "flex-end" },
  markAllPlaceholder: { width: 88 },
  markAllText: { fontSize: 13, fontWeight: "700", color: theme.primary },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", marginTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: theme.textOnLight, marginTop: 16 },
  emptyBody: {
    fontSize: 14,
    color: theme.textMutedOnLight,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  cardUnread: {
    backgroundColor: "#f0fdf4",
    borderColor: "#b1eaba",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.textOnLight, flex: 1 },
  cardTitleUnread: { fontWeight: "800" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
  cardBody: { fontSize: 13, color: theme.textMutedOnLight, marginTop: 4, lineHeight: 18 },
  cardTime: { fontSize: 11, color: theme.textMutedOnLight, marginTop: 6, fontWeight: "600" },
});
