import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiBranches } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { QueueStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { formatBookingSlotDateTime, defaultBranchOffsetMinutes } from "../utils/dateFormat";

type Props = NativeStackScreenProps<QueueStackParamList, "QueueHome">;

export function QueueHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { bookings, refreshBookings, checkIn, cancelBooking, branches } = useCustomer();
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

  const openReschedule = async (bookingId: string, branchId: string, serviceTypeId: string) => {
    try {
      const list = await apiBranches();
      const br = list.find((b) => b.id === branchId);
      const svc = br?.services.find((s) => s.id === serviceTypeId);
      if (!br || !svc) {
        Alert.alert("Reschedule", "Could not resolve branch or service.");
        return;
      }
      navigation.getParent()?.navigate(
        "Booking",
        {
          screen: "BookingSlots",
          params: { branch: br, service: svc, rescheduleId: bookingId },
        } as never,
      );
    } catch (e) {
      Alert.alert("Reschedule", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <Text style={styles.title}>Queue</Text>
      <Text style={styles.sub}>Live status for your tickets · pull bookings from server</Text>
      <PrimaryButton label="Refresh" variant="ghost" icon="refresh-outline" onPress={() => void refreshBookings()} />
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={listRefreshing}
            onRefresh={() => void onListRefresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor="#1e293b"
          />
        }
        ListEmptyComponent={<Text style={styles.muted}>No bookings yet — use the Booking tab.</Text>}
        renderItem={({ item }) => {
          const branchOff =
            branches.find((b) => b.id === item.branchId)?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
          return (
          <View style={styles.card}>
            <Text style={[styles.status, { color: theme.accent }]}>{item.status}</Text>
            <Text style={styles.meta}>
              {formatBookingSlotDateTime(item.slotStart, item.slotEnd, branchOff)}
            </Text>
            {item.ticketNumber ? <Text style={styles.ticket}>{item.ticketNumber}</Text> : null}
            <PrimaryButton
              label="Live queue view"
              variant="ghost"
              icon="pulse-outline"
              onPress={() => {
                if (!item.ticketNumber) {
                  Alert.alert("No ticket", "Booking may still be processing.");
                  return;
                }
                navigation.navigate("QueueTrack", { branchId: item.branchId, ticket: item.ticketNumber, bookingId: item.id });
              }}
            />
            <View style={styles.row}>
              <PrimaryButton label="Check-in" compact variant="ghost" icon="location-outline" onPress={() => void checkIn(item.id)} />
              <PrimaryButton label="Reschedule" compact variant="ghost" icon="calendar-outline" onPress={() => void openReschedule(item.id, item.branchId, item.serviceTypeId)} />
              <PrimaryButton label="Cancel" compact variant="danger" icon="close-circle-outline" onPress={() => void cancelBooking(item.id)} />
            </View>
          </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 18 },
  title: { fontSize: 26, fontWeight: "800", color: theme.text },
  sub: { color: theme.textMuted, marginBottom: 10 },
  muted: { color: theme.textMuted, marginTop: 24, textAlign: "center" },
  card: {
    backgroundColor: theme.bgCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  status: { fontWeight: "800", fontSize: 15 },
  meta: { color: theme.textMuted, fontSize: 13 },
  ticket: { fontSize: 22, fontWeight: "900", color: theme.accent, letterSpacing: 1 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
});
