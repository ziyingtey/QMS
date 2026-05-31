import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useMemo, useEffect, useState } from "react";
import {
  Alert,
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

  /** Hide bookings whose slot day (branch service zone) is before today — keeps today + future. */
  const visibleBookings = useMemo(() => {
    return bookings.filter((b) => {
      const off = branches.find((x) => x.id === b.branchId)?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
      const slotYmd = bookingSlotStartYmdInBranchZone(b.slotStart, off);
      if (!slotYmd) return true;
      const todayYmd = branchCalendarYmd(off);
      return compareIsoYmd(slotYmd, todayYmd) >= 0;
    });
  }, [bookings, branches]);


  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Queue</Text>
      <Text style={styles.sub}>Live status for your tickets · past days are hidden</Text>
      <FlatList
        data={visibleBookings}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={listRefreshing}
            onRefresh={() => void onListRefresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
            progressBackgroundColor="#ffffff"
          />
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            {bookings.length === 0
              ? "No bookings yet — use the Booking tab."
              : "No tickets for today or later — older appointments are hidden. Pull down to refresh."}
          </Text>
        }
        renderItem={({ item }) => {
          const branch = branches.find((b) => b.id === item.branchId);
          const branchOff = branch?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
          const branchName = branch?.name ?? "";
          const serviceName = branch?.services.find((s) => s.id === item.serviceTypeId)?.name ?? "";
          const isCancelled = item.status === "Cancelled";
          const timeLine = formatBookingSlotDateTime(item.slotStart, item.slotEnd, branchOff);

          return (
            <Pressable
              style={styles.card}
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
              <Text style={styles.status}>{item.status}</Text>
              {item.ticketNumber ? <Text style={styles.ticket}>{item.ticketNumber}</Text> : null}
              <Text style={styles.serviceName}>{serviceName}</Text>
              <Text style={styles.branchName}>{branchName}</Text>
              <Text style={styles.meta}>{timeLine}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg, paddingHorizontal: 18 },
  title: { fontSize: 26, fontWeight: "800", color: theme.textOnLight },
  sub: { color: theme.textMutedOnLight, marginBottom: 10 },
  muted: { color: theme.textMutedOnLight, marginTop: 24, textAlign: "center" },
  card: {
    backgroundColor: theme.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    gap: 8,
  },
  status: { fontWeight: "800", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  meta: { color: "rgba(255,255,255,0.65)", fontSize: 13 },
  ticket: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  serviceName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  branchName: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
});
