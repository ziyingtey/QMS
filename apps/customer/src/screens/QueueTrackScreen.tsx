import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { apiQueueStatus, type QueueStatus } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { QueueStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { formatBookingDateMedium, formatSlotRange, defaultBranchOffsetMinutes } from "../utils/dateFormat";
import { useBranchRealtime } from "../useBranchRealtime";

type Props = NativeStackScreenProps<QueueStackParamList, "QueueTrack">;

type Phase =
  | "future"        // Status 0: booking is for a future day
  | "today-await"   // Status 0.5: today but slot not started
  | "waiting"       // Status 1: peopleAhead > 1
  | "almost"        // Status 2: peopleAhead = 1
  | "next"          // Status 3: peopleAhead = 0
  | "serving"       // Status 4: called/serving
  | "completed"     // Status 5
  | "missed"        // Status 6
  | "loading";

export function QueueTrackScreen({ route, navigation }: Props) {
  const { branchId, ticket, bookingId: bookingIdParam } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { token, bookings, branches, refreshBookings, checkIn, cancelBooking, busy } = useCustomer();
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const booking = useMemo(() => {
    if (bookingIdParam) return bookings.find((b) => b.id === bookingIdParam) ?? null;
    return (
      bookings.find(
        (b) =>
          b.branchId === branchId &&
          b.ticketNumber === ticket &&
          b.status !== "Cancelled" &&
          b.status !== "Completed" &&
          b.status !== "NoShow",
      ) ?? null
    );
  }, [bookings, bookingIdParam, branchId, ticket]);

  const branchOffset = useMemo(
    () => branches.find((b) => b.id === branchId)?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes,
    [branches, branchId],
  );
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

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([refresh(), refreshBookings()]);
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh, refreshBookings]);

  const goToQueueBookingList = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: "QueueHome" }] });
  }, [navigation]);

  const displayService = status?.serviceName ?? serviceNameFromBooking ?? "\u2014";
  const appointmentBookingId = booking?.id ?? bookingIdParam ?? null;
  const entryIsTerminal = status?.state === "Completed" || status?.state === "Missed";
  const bookingIsActive =
    !entryIsTerminal &&
    (!booking ||
      (booking.status !== "Cancelled" && booking.status !== "Completed" && booking.status !== "NoShow"));
  const canModifyByTime = booking?.slotStart
    ? new Date(booking.slotStart).getTime() - Date.now() >= 60 * 60 * 1000
    : false;
  const showReschedule = Boolean(booking) && bookingIsActive && canModifyByTime;
  const showCancel = Boolean(appointmentBookingId) && bookingIsActive && canModifyByTime;

  // Determine phase
  const phase: Phase = useMemo(() => {
    if (!status) return "loading";
    if (status.state === "Completed") return "completed";
    if (status.state === "Missed") return "missed";
    if (status.state === "Called" || status.state === "Serving") return "serving";

    // For waiting state, check if it's a future booking or today-await
    if (status.state === "Waiting" && booking?.slotStart) {
      const now = new Date();
      const slotDate = new Date(booking.slotStart);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());

      if (slotDay > today) return "future";

      // Today but slot hasn't started yet
      if (slotDate > now) return "today-await";
    }

    if (status.state === "Waiting") {
      if (status.peopleAhead === 0) return "next";
      if (status.peopleAhead === 1) return "almost";
      return "waiting";
    }
    return "loading";
  }, [status, booking]);

  const showCheckIn = Boolean(appointmentBookingId) && bookingIsActive && phase !== "future";

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
          params: {
            branch: br,
            service: svc,
            rescheduleId: booking.id,
            rescheduleExitToQueue: true,
          },
        } as never,
      );
    } catch (e) {
      Alert.alert("Reschedule", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmCancelBooking = () => {
    if (!appointmentBookingId) return;
    Alert.alert(
      "Cancel this booking?",
      "Your queue ticket will be released. You can book again later.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const ok = await cancelBooking(appointmentBookingId);
              if (ok) goToQueueBookingList();
            })();
          },
        },
      ],
    );
  };

  // Progress tracker steps
  const progressSteps = ["Waiting", "Next", "Called", "Completed"];
  const activeStep = phase === "waiting" || phase === "almost" ? 0
    : phase === "next" ? 1
    : phase === "serving" ? 2
    : phase === "completed" ? 3
    : -1;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => void onPullRefresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
            progressBackgroundColor="#ffffff"
          />
        }
      >
        {/* Header */}
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            onPress={goToQueueBookingList}
          >
            <Ionicons name="chevron-back" size={28} color={theme.primaryDark} />
          </Pressable>
          <Text style={styles.pageTitle} numberOfLines={1}>
            Queue Status
          </Text>
        </View>

        {/* Blue Ticket Card */}
        <View style={styles.ticketCard}>
          <Text style={styles.ticketLabel}>Your Queue Number</Text>
          <Text style={styles.ticketBig}>{ticket}</Text>
          <Text style={styles.ticketService}>{displayService}</Text>
          <Text style={styles.ticketBranch}>{branchName}</Text>
          {booking ? (
            <View style={styles.ticketDateRow}>
              <View style={styles.ticketDateCol}>
                <Text style={styles.ticketDateLabel}>Date</Text>
                <Text style={styles.ticketDateValue}>{formatBookingDateMedium(booking.slotStart, branchOffset)}</Text>
              </View>
              <View style={styles.ticketDateDivider} />
              <View style={styles.ticketDateCol}>
                <Text style={styles.ticketDateLabel}>Time Slot</Text>
                <Text style={styles.ticketDateValue}>{formatSlotRange(booking.slotStart, booking.slotEnd, branchOffset)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ═══════ Phase: Future Booking ═══════ */}
        {phase === "future" && (
          <View style={styles.reminderCard}>
            <View style={styles.reminderIconRow}>
              <Ionicons name="calendar-outline" size={22} color={theme.primary} />
              <Text style={styles.reminderTitle}>Booking Confirmed</Text>
            </View>
            <Text style={styles.reminderText}>
              Please arrive 10 minutes before your appointment time.
            </Text>
          </View>
        )}

        {/* ═══════ Phase: Today Awaiting ═══════ */}
        {phase === "today-await" && (
          <>
            <View style={[styles.reminderCard, styles.reminderCardBlue]}>
              <View style={styles.reminderIconRow}>
                <Ionicons name="time-outline" size={22} color={theme.primary} />
                <Text style={styles.reminderTitle}>Appointment Today</Text>
              </View>
              <Text style={styles.reminderText}>
                Please arrive 10 minutes before your appointment time.
              </Text>
            </View>
            {showCheckIn && (
              <View style={styles.actionCard}>
                <PrimaryButton
                  label="I've arrived"
                  icon="checkmark-circle-outline"
                  disabled={busy}
                  onPress={() => void checkIn(appointmentBookingId!)}
                />
              </View>
            )}
          </>
        )}

        {/* ═══════ Phase: Waiting / Almost ═══════ */}
        {(phase === "waiting" || phase === "almost") && status && (
          <>
            {/* Progress Tracker */}
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                {progressSteps.map((step, i) => (
                  <View key={step} style={styles.progressStep}>
                    <View style={[styles.progressDot, i <= activeStep && styles.progressDotActive]} />
                    <Text style={[styles.progressLabel, i <= activeStep && styles.progressLabelActive]}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Live Status */}
            <View style={styles.liveCard}>
              <View style={styles.liveGrid}>
                <View style={styles.liveCell}>
                  <Text style={styles.liveLab}>Now Serving</Text>
                  <Text style={styles.liveVal}>{status.currentServingTicketNumber ?? "\u2014"}</Text>
                </View>
                <View style={styles.liveCell}>
                  <Text style={styles.liveLab}>People Ahead</Text>
                  <Text style={styles.liveVal}>{status.peopleAhead}</Text>
                </View>
                <View style={styles.liveCell}>
                  <Text style={styles.liveLab}>Est. Wait</Text>
                  <Text style={[styles.liveVal, styles.liveWait]}>
                    {status.estimatedWaitMinutes == null ? "\u2014" : `${status.estimatedWaitMinutes}m`}
                  </Text>
                </View>
              </View>

              {phase === "waiting" && status.estimatedWaitMinutes != null && (
                <View style={styles.messageBox}>
                  <Ionicons name="time-outline" size={16} color={theme.primary} />
                  <Text style={styles.messageText}>
                    You will be called in approximately {status.estimatedWaitMinutes} minutes.
                  </Text>
                </View>
              )}
              {phase === "almost" && (
                <View style={[styles.messageBox, styles.messageBoxAmber]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#d97706" />
                  <Text style={[styles.messageText, styles.messageTextAmber]}>
                    Almost there! You will be called very soon.
                  </Text>
                </View>
              )}
            </View>

            {showCheckIn && (
              <View style={styles.actionCard}>
                <PrimaryButton
                  label="I've arrived"
                  icon="checkmark-circle-outline"
                  disabled={busy}
                  onPress={() => void checkIn(appointmentBookingId!)}
                />
              </View>
            )}
          </>
        )}

        {/* ═══════ Phase: Next In Line ═══════ */}
        {phase === "next" && (
          <>
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                {progressSteps.map((step, i) => (
                  <View key={step} style={styles.progressStep}>
                    <View style={[styles.progressDot, i <= 1 && styles.progressDotActive]} />
                    <Text style={[styles.progressLabel, i <= 1 && styles.progressLabelActive]}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.statusCard}>
              <View style={[styles.statusIcon, styles.statusIconYellow]}>
                <Ionicons name="notifications" size={32} color="#d97706" />
              </View>
              <Text style={styles.statusTitle}>You are next in line</Text>
              <Text style={styles.statusSub}>Please be ready. You will be called shortly.</Text>
            </View>

            {showCheckIn && (
              <View style={styles.actionCard}>
                <PrimaryButton
                  label="I've arrived"
                  icon="checkmark-circle-outline"
                  disabled={busy}
                  onPress={() => void checkIn(appointmentBookingId!)}
                />
              </View>
            )}
          </>
        )}

        {/* ═══════ Phase: Serving / Called ═══════ */}
        {phase === "serving" && status && (
          <>
            <View style={styles.progressCard}>
              <View style={styles.progressRow}>
                {progressSteps.map((step, i) => (
                  <View key={step} style={styles.progressStep}>
                    <View style={[styles.progressDot, i <= 2 && styles.progressDotActive]} />
                    <Text style={[styles.progressLabel, i <= 2 && styles.progressLabelActive]}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.statusCard}>
              <View style={[styles.statusIcon, styles.statusIconGreen]}>
                <Ionicons name="checkmark-circle" size={32} color="#15803d" />
              </View>
              <Text style={[styles.statusTitle, { color: "#15803d" }]}>It's your turn now</Text>
              {status.counterNumber != null ? (
                <>
                  <Text style={styles.statusSub}>Please proceed to</Text>
                  <View style={styles.counterBadge}>
                    <Text style={styles.counterBadgeText}>Counter {status.counterNumber}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.statusSub}>Please proceed to the counter.</Text>
              )}
            </View>
          </>
        )}

        {/* ═══════ Phase: Completed ═══════ */}
        {phase === "completed" && status && (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, styles.statusIconGreen]}>
              <Ionicons name="checkmark-circle" size={40} color="#15803d" />
            </View>
            <Text style={[styles.statusTitle, { color: "#15803d" }]}>Service completed</Text>
            {status.counterNumber != null && (
              <View style={styles.completedRow}>
                <Text style={styles.completedLabel}>Served at</Text>
                <Text style={styles.completedValue}>Counter {status.counterNumber}</Text>
              </View>
            )}
            {status.servedAt && (
              <View style={styles.completedRow}>
                <Text style={styles.completedLabel}>Completed at</Text>
                <Text style={styles.completedValue}>
                  {new Date(status.servedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            )}
            <Text style={[styles.statusSub, { marginTop: 16 }]}>Thank you for visiting.</Text>
          </View>
        )}

        {/* ═══════ Phase: Missed ═══════ */}
        {phase === "missed" && (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, styles.statusIconRed]}>
              <Ionicons name="alert-circle" size={40} color="#dc2626" />
            </View>
            <Text style={[styles.statusTitle, { color: "#dc2626" }]}>You missed your turn</Text>
            <Text style={styles.statusSub}>Please approach the counter or take a new ticket.</Text>
          </View>
        )}

        {/* ═══════ Phase: Loading ═══════ */}
        {phase === "loading" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusSub}>Loading queue information...</Text>
          </View>
        )}

        {/* Walk-in note (no booking) */}
        {!booking && !entryIsTerminal && (
          <Text style={styles.walkInNote}>
            Walk-in ticket: staff will serve you at the counter.
          </Text>
        )}

        {/* Action buttons */}
        {(showReschedule || showCancel) && (
          <>
            <View style={styles.rowBtns}>
              {showReschedule && (
                <Pressable style={styles.btnGhost} disabled={busy} onPress={() => void openReschedule()}>
                  <Text style={styles.btnGhostText}>Reschedule</Text>
                </Pressable>
              )}
              {showCancel && (
                <Pressable style={styles.btnDangerGhost} disabled={busy} onPress={confirmCancelBooking}>
                  <Text style={styles.btnDangerGhostText}>Cancel</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.modifyNote}>
              Reschedule or cancel is only available up to 1 hour before your appointment time.
            </Text>
          </>
        )}
        {Boolean(booking) && bookingIsActive && !canModifyByTime && (
          <Text style={styles.modifyNoteDisabled}>
            Reschedule and cancel are no longer available (less than 1 hour before appointment).
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg, paddingHorizontal: 18 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { marginLeft: -6, marginRight: 4, paddingVertical: 4, paddingRight: 4, borderRadius: 10 },
  backBtnPressed: { opacity: 0.65 },
  pageTitle: { flex: 1, fontSize: 22, fontWeight: "900", color: theme.textOnLight },

  // Blue ticket card
  ticketCard: {
    backgroundColor: theme.primary,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  ticketLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  ticketBig: {
    fontSize: 42,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    marginVertical: 6,
  },
  ticketService: { fontSize: 15, fontWeight: "700", color: "#fff" },
  ticketBranch: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  ticketDateRow: {
    flexDirection: "row",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.25)",
    paddingTop: 12,
  },
  ticketDateCol: { flex: 1 },
  ticketDateDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.25)", marginHorizontal: 12 },
  ticketDateLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  ticketDateValue: { fontSize: 14, color: "#fff", fontWeight: "700", marginTop: 2 },

  // Reminder card (green for future, blue for today)
  reminderCard: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  reminderCardBlue: {
    backgroundColor: "rgba(59,130,246,0.1)",
    borderColor: "rgba(59,130,246,0.25)",
  },
  reminderIconRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  reminderTitle: { fontSize: 16, fontWeight: "800", color: theme.textOnLight },
  reminderText: { fontSize: 14, color: theme.textMutedOnLight, lineHeight: 20 },

  // Progress tracker
  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressStep: { alignItems: "center", flex: 1 },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
    marginBottom: 6,
  },
  progressDotActive: { backgroundColor: theme.primary },
  progressLabel: { fontSize: 11, color: "#94a3b8", fontWeight: "600" },
  progressLabelActive: { color: theme.primary, fontWeight: "700" },

  // Live status card
  liveCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  liveGrid: { flexDirection: "row", gap: 8 },
  liveCell: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  liveLab: { fontSize: 10, fontWeight: "700", color: theme.textMutedOnLight, textAlign: "center" },
  liveVal: { fontSize: 18, fontWeight: "900", color: theme.textOnLight, marginTop: 4, textAlign: "center" },
  liveWait: { color: theme.primary },
  messageBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderRadius: 10,
    padding: 12,
  },
  messageBoxAmber: { backgroundColor: "rgba(217,119,6,0.08)" },
  messageText: { fontSize: 13, color: theme.primary, fontWeight: "600", flex: 1, lineHeight: 18 },
  messageTextAmber: { color: "#d97706" },

  // Status card (next, serving, completed, missed)
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.borderLight,
    alignItems: "center",
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statusIconYellow: { backgroundColor: "rgba(217,119,6,0.12)" },
  statusIconGreen: { backgroundColor: "rgba(21,128,61,0.1)" },
  statusIconRed: { backgroundColor: "rgba(220,38,38,0.1)" },
  statusTitle: { fontSize: 20, fontWeight: "900", color: theme.textOnLight, textAlign: "center" },
  statusSub: { fontSize: 14, color: theme.textMutedOnLight, marginTop: 6, textAlign: "center", lineHeight: 20 },
  counterBadge: {
    marginTop: 12,
    backgroundColor: "#15803d",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  counterBadgeText: { fontSize: 18, fontWeight: "900", color: "#fff" },
  completedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 10,
    paddingHorizontal: 8,
  },
  completedLabel: { fontSize: 14, color: theme.textMutedOnLight },
  completedValue: { fontSize: 14, fontWeight: "700", color: theme.textOnLight },

  // Action card
  actionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },

  // Walk-in note
  walkInNote: {
    fontSize: 13,
    color: theme.textMutedOnLight,
    marginBottom: 14,
    lineHeight: 18,
    paddingHorizontal: 4,
  },

  // Bottom action buttons
  rowBtns: { flexDirection: "row", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  btnGhost: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#e2e8f0",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnGhostText: { fontWeight: "800", color: theme.textOnLight },
  btnDangerGhost: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "rgba(239,68,68,0.1)",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDangerGhostText: { fontWeight: "800", color: "#dc2626" },
  modifyNote: {
    fontSize: 12,
    color: theme.textMutedOnLight,
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 16,
  },
  modifyNoteDisabled: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 16,
    fontStyle: "italic",
  },
});
