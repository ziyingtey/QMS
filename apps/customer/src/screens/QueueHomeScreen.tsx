import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useMemo, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../context/CustomerContext";
import type { QueueStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import {
  bookingSlotStartYmdInBranchZone,
  branchCalendarYmd,
  compareIsoYmd,
  defaultBranchOffsetMinutes,
  formatBookingSlotDateTime,
} from "../utils/dateFormat";

type Props = NativeStackScreenProps<QueueStackParamList, "QueueHome">;

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  Confirmed: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  Waiting: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  Serving: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
  Completed: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  Cancelled: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  Missed: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
};

export function QueueHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { bookings, refreshBookings, branches } = useCustomer();
  const [listRefreshing, setListRefreshing] = useState(false);

  useEffect(() => {
    void refreshBookings();
  }, [refreshBookings]);

  const onListRefresh = async () => {
    setListRefreshing(true);
    try {
      await refreshBookings();
    } finally {
      setListRefreshing(false);
    }
  };

  /** Split into active (today+future) and history (past 7 days). */
  const { activeBookings, historyBookings } = useMemo(() => {
    const active: typeof bookings = [];
    const history: typeof bookings = [];
    for (const b of bookings) {
      const off = branches.find((x) => x.id === b.branchId)?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
      const slotYmd = bookingSlotStartYmdInBranchZone(b.slotStart, off);
      const todayYmd = branchCalendarYmd(off);
      if (!slotYmd || compareIsoYmd(slotYmd, todayYmd) >= 0) {
        active.push(b);
      } else {
        // past 7 days
        const slotDate = new Date(slotYmd);
        const todayDate = new Date(todayYmd);
        const diffDays = Math.floor((todayDate.getTime() - slotDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          history.push(b);
        }
      }
    }
    return { activeBookings: active, historyBookings: history };
  }, [bookings, branches]);


  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Text style={styles.title}>My Queue</Text>
        <Text style={styles.sub}>Track all your active and past queues</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={listRefreshing}
            onRefresh={() => void onListRefresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
            progressBackgroundColor="#ffffff"
          />
        }
      >
        {activeBookings.length === 0 && historyBookings.length === 0 && (
          <Text style={styles.muted}>
            {bookings.length === 0
              ? "No bookings yet — use the Booking tab."
              : "No recent tickets. Pull down to refresh."}
          </Text>
        )}

        {activeBookings.map((item) => {
          const branch = branches.find((b) => b.id === item.branchId);
          const branchOff = branch?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
          const branchName = branch?.name ?? "";
          const serviceName = branch?.services.find((s) => s.id === item.serviceTypeId)?.name ?? "";
          const timeLine = formatBookingSlotDateTime(item.slotStart, item.slotEnd, branchOff);
          const colors = statusColors[item.status] ?? statusColors.Confirmed;
          const isActive = item.status === "Confirmed" || item.status === "Waiting" || item.status === "Serving";

          return (
            <Pressable
              key={item.id}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => {
                if (!item.ticketNumber) {
                  Alert.alert("No ticket", "Booking may still be processing.");
                  return;
                }
                navigation.navigate("QueueTrack", {
                  branchId: item.branchId,
                  ticket: item.ticketNumber,
                  bookingId: item.id,
                });
              }}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                  <Text style={[styles.statusText, { color: colors.text }]}>{item.status.toUpperCase()}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMutedOnLight} />
              </View>
              {item.ticketNumber ? <Text style={styles.ticket}>{item.ticketNumber}</Text> : null}
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={14} color={theme.textMutedOnLight} />
                <Text style={styles.infoText}>{branchName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={14} color={theme.textMutedOnLight} />
                <Text style={styles.infoText}>{timeLine}</Text>
              </View>
              {serviceName ? (
                <View style={styles.infoRow}>
                  <Ionicons name="briefcase-outline" size={14} color={theme.textMutedOnLight} />
                  <Text style={styles.infoText}>{serviceName}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {historyBookings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>History</Text>
            {historyBookings.map((item) => {
              const branch = branches.find((b) => b.id === item.branchId);
              const branchOff = branch?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
              const branchName = branch?.name ?? "";
              const serviceName = branch?.services.find((s) => s.id === item.serviceTypeId)?.name ?? "";
              const timeLine = formatBookingSlotDateTime(item.slotStart, item.slotEnd, branchOff);
              const colors = statusColors[item.status] ?? statusColors.Confirmed;

              return (
                <Pressable
                  key={item.id}
                  style={styles.card}
                  onPress={() => {
                    if (!item.ticketNumber) return;
                    navigation.navigate("QueueTrack", {
                      branchId: item.branchId,
                      ticket: item.ticketNumber,
                      bookingId: item.id,
                    });
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                      <Text style={[styles.statusText, { color: colors.text }]}>{item.status.toUpperCase()}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMutedOnLight} />
                  </View>
                  {item.ticketNumber ? <Text style={styles.ticket}>{item.ticketNumber}</Text> : null}
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={14} color={theme.textMutedOnLight} />
                    <Text style={styles.infoText}>{branchName}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={14} color={theme.textMutedOnLight} />
                    <Text style={styles.infoText}>{timeLine}</Text>
                  </View>
                  {serviceName ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="briefcase-outline" size={14} color={theme.textMutedOnLight} />
                      <Text style={styles.infoText}>{serviceName}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
  header: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#fff" },
  sub: { color: "rgba(255,255,255,0.65)", marginTop: 4, fontSize: 13 },
  muted: { color: theme.textMutedOnLight, marginTop: 24, textAlign: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: theme.textOnLight, marginTop: 20, marginBottom: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 0,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardActive: {
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: "800" },
  ticket: { fontSize: 20, fontWeight: "900", color: theme.textOnLight, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  infoText: { fontSize: 13, color: theme.textMutedOnLight, fontWeight: "500" },
});
