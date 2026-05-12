import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { BookingStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { formatBookingSlotDateTime } from "../utils/dateFormat";

type Props = NativeStackScreenProps<BookingStackParamList, "BookingTicket">;

export function BookingTicketScreen({ navigation, route }: Props) {
  const { created, branchId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { checkIn, navigateToQueueTrack } = useCustomer();

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Booking confirmed!</Text>
      </View>
      <Text style={styles.service}>{created.serviceName}</Text>
      <Text style={styles.ticket}>{created.ticketNumber}</Text>
      <Text style={styles.when}>{formatBookingSlotDateTime(created.slotStart, created.slotEnd)}</Text>
      <PrimaryButton label="I've arrived — check in" icon="location-outline" onPress={() => void checkIn(created.bookingId)} />
      <PrimaryButton
        label="Live queue status"
        variant="ghost"
        icon="pulse-outline"
        onPress={() => navigateToQueueTrack(branchId, created.ticketNumber)}
      />
      <PrimaryButton label="Done" variant="ghost" onPress={() => navigation.navigate("BookingBranches")} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, gap: 12 },
  banner: {
    backgroundColor: theme.success,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  bannerText: { color: "#052e16", fontWeight: "800", fontSize: 16 },
  service: { color: theme.textMuted, textAlign: "center", marginTop: 8 },
  ticket: { fontSize: 38, fontWeight: "900", color: theme.accent, textAlign: "center", letterSpacing: 2 },
  when: { color: theme.textMuted, textAlign: "center", marginBottom: 8 },
});
