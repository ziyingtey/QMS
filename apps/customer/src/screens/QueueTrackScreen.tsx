import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiQueueStatus, type QueueStatus } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { QueueStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { formatBookingDateMedium, formatSlotRange } from "../utils/dateFormat";
import { useBranchRealtime } from "../useBranchRealtime";

type Props = NativeStackScreenProps<QueueStackParamList, "QueueTrack">;

export function QueueTrackScreen({ route, navigation }: Props) {
  const { branchId, ticket, bookingId: bookingIdParam } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { token, bookings, branches, refreshBookings, checkIn, cancelBooking } = useCustomer();
  const [status, setStatus] = useState<QueueStatus | null>(null);

  const booking = useMemo(() => {
    if (bookingIdParam) return bookings.find((b) => b.id === bookingIdParam) ?? null;
    return (
      bookings.find((b) => b.branchId === branchId && b.ticketNumber === ticket && b.status !== "Cancelled") ?? null
    );
  }, [bookings, bookingIdParam, branchId, ticket]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Branch";
  const serviceNameFromBooking = useMemo(() => {
    if (!booking) return null;
    const br = branches.find((b) => b.id === booking.branchId);
    return br?.services.find((s) => s.id === booking.serviceTypeId)?.name ?? null;
  }, [booking, branches]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiQueueStatus(branchId, ticket));
    } catch {
      setStatus(null);
    }
  }, [branchId, ticket]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 12000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    void refreshBookings();
  }, [refreshBookings]);

  const onRealtime = useCallback(() => {
    void refresh();
  }, [refresh]);

  useBranchRealtime({
    branchIds: useMemo(() => [branchId], [branchId]),
    enabled: true,
    accessToken: token,
    onEvent: onRealtime,
  });

  const displayService = status?.serviceName ?? serviceNameFromBooking ?? "—";
  const hasBookingActions = Boolean(booking?.id);

  const openReschedule = async () => {
    if (!booking) return;
    try {
      const br = branches.find((b) => b.id === booking.branchId);
      const svc = br?.services.find((s) => s.id === booking.serviceTypeId);
      if (!br || !svc) {
        Alert.alert("Reschedule", "Could not resolve branch or service.");
        return;
      }
      navigation.getParent()?.navigate(
        "Booking",
        {
          screen: "BookingSlots",
          params: { branch: br, service: svc, rescheduleId: booking.id },
        } as never,
      );
    } catch (e) {
      Alert.alert("Reschedule", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Queue status</Text>

        {booking ? (
          <View style={styles.confirmBanner}>
            <Text style={styles.confirmTitle}>Booking confirmed</Text>
            <Text style={styles.confirmSub}>Your appointment is scheduled. Live updates refresh below.</Text>
          </View>
        ) : (
          <View style={styles.walkBanner}>
            <Text style={styles.walkBannerTitle}>Walk-in ticket</Text>
            <Text style={styles.walkBannerSub}>You are in the queue. Live position updates below.</Text>
          </View>
        )}

        <View style={styles.ticketCard}>
          <Text style={styles.ticketLabel}>Your queue number</Text>
          <Text style={styles.ticketBig}>{ticket}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.dl}>Service</Text>
            <Text style={styles.dv}>{displayService}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.dl}>Branch</Text>
            <Text style={styles.dv}>{branchName}</Text>
          </View>
          {booking ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.dl}>Time slot</Text>
                <Text style={styles.dv}>{formatSlotRange(booking.slotStart, booking.slotEnd)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.dl}>Date</Text>
                <Text style={styles.dv}>{formatBookingDateMedium(booking.slotStart)}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.liveCard}>
          <Text style={styles.liveTitle}>Live status</Text>
          <View style={styles.liveGrid}>
            <View style={styles.liveCell}>
              <Text style={styles.liveLab}>Now serving</Text>
              <Text style={styles.liveVal}>{status?.currentServingTicketNumber ?? "—"}</Text>
            </View>
            <View style={styles.liveCell}>
              <Text style={styles.liveLab}>People ahead</Text>
              <Text style={styles.liveVal}>{status?.peopleAhead ?? "—"}</Text>
            </View>
            <View style={styles.liveCell}>
              <Text style={styles.liveLab}>Est. wait</Text>
              <Text style={[styles.liveVal, styles.liveWait]}>
                {status?.estimatedWaitMinutes == null ? "—" : `~${status.estimatedWaitMinutes}m`}
              </Text>
            </View>
          </View>
          {status?.nextEstimatedMessage ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{status.nextEstimatedMessage}</Text>
            </View>
          ) : status?.estimatedWaitMinutes != null ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                You will be called in approximately {status.estimatedWaitMinutes} minutes.
              </Text>
            </View>
          ) : null}
        </View>

        {hasBookingActions ? (
          <View style={styles.checkCard}>
            <Text style={styles.checkTitle}>Check-in required</Text>
            <PrimaryButton
              label="I've arrived — check in"
              icon="qr-code-outline"
              onPress={() => void checkIn(booking!.id)}
            />
          </View>
        ) : (
          <Text style={styles.walkInNote}>
            Walk-in ticket: check in at the branch counter. Online check-in applies to booked appointments only.
          </Text>
        )}

        <View style={styles.rowBtns}>
          {hasBookingActions ? (
            <Pressable style={styles.btnGhost} onPress={() => void openReschedule()}>
              <Text style={styles.btnGhostText}>Reschedule</Text>
            </Pressable>
          ) : null}
          {hasBookingActions ? (
            <Pressable style={styles.btnDangerGhost} onPress={() => void cancelBooking(booking!.id)}>
              <Text style={styles.btnDangerGhostText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>

        <PrimaryButton label="Refresh now" variant="ghost" icon="refresh-outline" onPress={() => void refresh()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg, paddingHorizontal: 18 },
  pageTitle: { fontSize: 22, fontWeight: "900", color: theme.textOnLight, marginBottom: 12 },
  confirmBanner: {
    backgroundColor: "rgba(34,197,94,0.18)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  confirmTitle: { fontSize: 16, fontWeight: "900", color: "#14532d" },
  confirmSub: { fontSize: 13, color: "#166534", marginTop: 4, lineHeight: 18 },
  walkBanner: {
    backgroundColor: "rgba(56,189,248,0.15)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.35)",
  },
  walkBannerTitle: { fontSize: 16, fontWeight: "900", color: theme.primaryDark },
  walkBannerSub: { fontSize: 13, color: theme.textOnLight, marginTop: 4, lineHeight: 18 },
  ticketCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  ticketLabel: { fontSize: 13, color: theme.textMutedOnLight, fontWeight: "600" },
  ticketBig: {
    fontSize: 40,
    fontWeight: "900",
    color: theme.primaryDark,
    letterSpacing: 2,
    marginVertical: 8,
  },
  detailRow: { marginTop: 10 },
  dl: { fontSize: 12, color: theme.textMutedOnLight, fontWeight: "600" },
  dv: { fontSize: 15, color: theme.textOnLight, fontWeight: "700", marginTop: 2 },
  liveCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  liveTitle: { fontSize: 15, fontWeight: "800", color: theme.textOnLight, marginBottom: 12 },
  liveGrid: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  liveCell: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  liveLab: { fontSize: 10, fontWeight: "700", color: theme.textMutedOnLight, textAlign: "center" },
  liveVal: { fontSize: 16, fontWeight: "900", color: theme.textOnLight, marginTop: 6, textAlign: "center" },
  liveWait: { color: theme.success },
  infoBox: {
    marginTop: 12,
    backgroundColor: "rgba(56,189,248,0.12)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.25)",
  },
  infoText: { fontSize: 13, color: theme.primaryDark, fontWeight: "600", lineHeight: 18 },
  checkCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  checkTitle: { fontSize: 15, fontWeight: "800", color: theme.textOnLight, marginBottom: 10 },
  walkInNote: {
    fontSize: 13,
    color: theme.textMutedOnLight,
    marginBottom: 14,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  rowBtns: { flexDirection: "row", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  btnGhost: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#e2e8f0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnGhostText: { fontWeight: "800", color: theme.textOnLight },
  btnDangerGhost: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "rgba(239,68,68,0.12)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDangerGhostText: { fontWeight: "800", color: theme.danger },
});
