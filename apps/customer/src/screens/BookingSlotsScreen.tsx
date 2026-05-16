import type { NativeStackScreenProps } from "@react-navigation/native-stack";
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
import { apiCreateBooking, apiRescheduleBooking, apiSlots, userFacingApiError, type SlotDto } from "../api";
import { readToken } from "../authStorage";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { BookingStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import {
  branchCalendarYmd,
  buildMonthGrid,
  compareIsoYmd,
  deviceLocalCalendarYmd,
  formatSlotRange,
  monthTitle,
  parseYmd,
} from "../utils/dateFormat";

type Props = NativeStackScreenProps<BookingStackParamList, "BookingSlots">;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function BookingSlotsScreen({ navigation, route }: Props) {
  const { branch, service, rescheduleId } = route.params;
  const { token: sessionToken } = useCustomer();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const offsetMin = branch.serviceZoneOffsetMinutes ?? 8 * 60;

  const minYmd = useMemo(() => branchCalendarYmd(offsetMin), [offsetMin]);

  const [selectedYmd, setSelectedYmd] = useState(minYmd);
  const [viewYmd, setViewYmd] = useState(() => parseYmd(minYmd));

  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [slotPullRefreshing, setSlotPullRefreshing] = useState(false);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDto | null>(null);

  const calendarCells = useMemo(
    () => buildMonthGrid(viewYmd.y, viewYmd.m0, minYmd),
    [viewYmd.y, viewYmd.m0, minYmd],
  );
  const calendarRows = useMemo(() => chunk(calendarCells, 7), [calendarCells]);

  useEffect(() => {
    setSelectedYmd(minYmd);
    setViewYmd(parseYmd(minYmd));
  }, [branch.id, minYmd]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedYmd, service.id, branch.id]);

  const reload = useCallback(async () => {
    const tok = (sessionToken ?? (await readToken()))?.trim() || null;
    if (!tok) {
      Alert.alert("Sign in required", "Log in from the Profile tab to load booking slots.");
      return;
    }
    setBusy(true);
    try {
      let list = await apiSlots(branch.id, service.id, selectedYmd, tok);
      let usedDay = selectedYmd;
      if (list.length === 0 && selectedYmd === minYmd) {
        const fallback = deviceLocalCalendarYmd();
        if (fallback !== minYmd) {
          list = await apiSlots(branch.id, service.id, fallback, tok);
          if (list.length > 0) usedDay = fallback;
        }
      }
      setLoadedDay(usedDay);
      setSlots(list);
    } catch (e) {
      Alert.alert("Couldn’t load slots", userFacingApiError(e));
      setSlots([]);
      setLoadedDay(null);
    } finally {
      setBusy(false);
    }
  }, [branch.id, minYmd, selectedYmd, service.id, sessionToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSlotPullRefresh = async () => {
    setSlotPullRefreshing(true);
    try {
      await reload();
    } finally {
      setSlotPullRefreshing(false);
    }
  };

  const shiftViewMonth = (delta: number) => {
    const d = new Date(viewYmd.y, viewYmd.m0 + delta, 1);
    setViewYmd({ y: d.getFullYear(), m0: d.getMonth(), d: 1 });
  };

  const selectDay = (ymd: string, disabled: boolean) => {
    if (disabled || compareIsoYmd(ymd, minYmd) < 0) return;
    setSelectedYmd(ymd);
    const p = parseYmd(ymd);
    setViewYmd(p);
  };

  const bookSlot = async (slot: SlotDto) => {
    if (slot.status === "Full") return;
    const tok = (sessionToken ?? (await readToken()))?.trim() || null;
    if (!tok) {
      Alert.alert("Sign in", "Use Profile tab — you must be logged in to book.");
      return;
    }
    setBusy(true);
    try {
      if (rescheduleId) {
        await apiRescheduleBooking(tok, rescheduleId, slot.slotStart, slot.slotEnd);
        Alert.alert("Rescheduled", "Your appointment time was updated.");
        navigation.navigate("BookingBranches");
        return;
      }
      const created = await apiCreateBooking(tok, {
        branchId: branch.id,
        serviceTypeId: service.id,
        slotStart: slot.slotStart,
        slotEnd: slot.slotEnd,
      });
      navigation.navigate("BookingTicket", { created, branchId: branch.id });
    } catch (e) {
      Alert.alert("Booking failed", userFacingApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = () => {
    if (!selectedSlot) {
      Alert.alert("Select a time", "Choose an available slot first.");
      return;
    }
    void bookSlot(selectedSlot);
  };

  return (
    <View style={styles.wrap}>
      <StatusBar style="light" />
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <Pressable style={styles.back} onPress={() => navigation.navigate("BookingServices", { branch })}>
          <Text style={styles.backText}>← Services</Text>
        </Pressable>
        <Text style={styles.heroTitle}>{rescheduleId ? "Reschedule" : "Book appointment"}</Text>
        <Text style={styles.heroStep}>Pick date and time</Text>
        <Text style={styles.heroSvc}>{service.name}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 18 }}
        refreshControl={
          <RefreshControl
            refreshing={slotPullRefreshing}
            onRefresh={() => void onSlotPullRefresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor="#1e293b"
          />
        }
      >
        <View style={styles.calHeader}>
          <Pressable onPress={() => shiftViewMonth(-1)} style={styles.calNav} hitSlop={12}>
            <Text style={styles.calNavText}>‹</Text>
          </Pressable>
          <Text style={styles.calTitle}>{monthTitle(viewYmd.y, viewYmd.m0)}</Text>
          <Pressable onPress={() => shiftViewMonth(1)} style={styles.calNav} hitSlop={12}>
            <Text style={styles.calNavText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {weekdayLabels.map((w) => (
            <Text key={w} style={styles.weekCell}>
              {w}
            </Text>
          ))}
        </View>
        {calendarRows.map((row, ri) => (
          <View key={`r-${ri}`} style={styles.dayRow}>
            {row.map((cell) => {
              const selected = cell.ymd === selectedYmd;
              const muted = !cell.inMonth || cell.disabled;
              return (
                <Pressable
                  key={cell.key}
                  onPress={() => selectDay(cell.ymd, cell.disabled)}
                  style={[
                    styles.dayCell,
                    muted && styles.dayCellMuted,
                    selected && cell.inMonth && !cell.disabled && styles.dayCellSelected,
                  ]}
                  disabled={cell.disabled}
                >
                  <Text
                    style={[
                      styles.dayCellText,
                      muted && styles.dayCellTextMuted,
                      selected && cell.inMonth && !cell.disabled && styles.dayCellTextSelected,
                    ]}
                  >
                    {cell.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={styles.hintMuted}>
          Grey = unavailable (before {minYmd} in branch time zone). Today is {minYmd}.
        </Text>

        <Text style={styles.slotsHeading}>
          Times for {selectedYmd}
          {busy && loadedDay === null ? " · Loading…" : ""}
          {!busy && loadedDay && loadedDay !== selectedYmd ? " (alternate day loaded)" : ""}
        </Text>
        {!busy && loadedDay && loadedDay !== selectedYmd ? (
          <Text style={styles.muted}>
            Branch-local “today” had no slots; showing device calendar day {loadedDay} instead.
          </Text>
        ) : null}
        <PrimaryButton label="Reload slots" variant="ghost" icon="refresh-outline" onPress={() => void reload()} disabled={busy} />
        {slots.length === 0 && !busy ? (
          <Text style={styles.muted}>No slots for this date — try another day or confirm API is running.</Text>
        ) : null}

        {slots.map((slot) => {
          const full = slot.status === "Full";
          const limited = slot.status === "Limited";
          const selected = selectedSlot?.slotStart === slot.slotStart;
          return (
            <Pressable
              key={slot.slotStart}
              disabled={full}
              onPress={() => {
                if (full) return;
                setSelectedSlot(slot);
              }}
              style={[
                styles.slotCard,
                full && styles.slotCardFull,
                !full && styles.slotCardOpen,
                selected && !full && styles.slotCardSelected,
              ]}
            >
              <Text style={[styles.slotTime, full && styles.slotTimeFull, !full && styles.slotTimeOpen]}>
                {formatSlotRange(slot.slotStart, slot.slotEnd, offsetMin)}
              </Text>
              <View style={styles.slotRight}>
                {full ? (
                  <View style={styles.badgeFull}>
                    <Text style={styles.badgeFullText}>FULL</Text>
                  </View>
                ) : limited ? (
                  <View style={styles.badgeLim}>
                    <Text style={styles.badgeLimText}>LIMITED</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.meta, full ? styles.metaFull : styles.metaOpen]}>
                Online {slot.onlineUsed}/{slot.onlineCapacity} · Walk-in {slot.walkInUsed}/{slot.walkInCapacity}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <PrimaryButton label="CONFIRM" variant="success" disabled={!selectedSlot || busy} onPress={onConfirm} />
        <PrimaryButton label="CANCEL" variant="danger" onPress={() => navigation.navigate("BookingServices", { branch })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.screenBg },
  topBar: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  scroll: { flex: 1 },
  back: { marginBottom: 6, alignSelf: "flex-start" },
  backText: { color: theme.accent, fontWeight: "700", fontSize: 16 },
  heroTitle: { fontSize: 22, fontWeight: "900", color: "#fff" },
  heroStep: { fontSize: 16, fontWeight: "700", color: "rgba(255,255,255,0.92)", marginTop: 8 },
  heroSvc: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 10,
  },
  calNav: { paddingHorizontal: 12, paddingVertical: 6 },
  calNavText: { fontSize: 22, color: theme.primaryDark, fontWeight: "800" },
  calTitle: { fontSize: 17, fontWeight: "700", color: theme.textOnLight },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: theme.textMutedOnLight },
  dayRow: { flexDirection: "row", marginBottom: 4 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    marginHorizontal: 2,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  dayCellMuted: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    opacity: 0.45,
  },
  dayCellSelected: {
    backgroundColor: theme.primaryDark,
    borderColor: theme.primaryDark,
  },
  dayCellText: { fontSize: 15, fontWeight: "700", color: theme.textOnLight },
  dayCellTextMuted: { color: theme.textMutedOnLight },
  dayCellTextSelected: { color: "#fff" },
  hintMuted: { fontSize: 11, color: theme.textMutedOnLight, marginBottom: 14, marginTop: 4 },
  slotsHeading: { fontSize: 16, fontWeight: "700", color: theme.textOnLight, marginBottom: 8 },
  muted: { color: theme.textMutedOnLight, marginVertical: 12 },
  slotCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  slotCardOpen: {
    backgroundColor: theme.primaryDark,
  },
  slotCardFull: {
    backgroundColor: "#d1d9e3",
    opacity: 0.85,
  },
  slotCardSelected: {
    borderColor: theme.accent,
  },
  slotTime: { fontSize: 17, fontWeight: "800" },
  slotTimeOpen: { color: "#fff" },
  slotTimeFull: { color: theme.textMutedOnLight },
  slotRight: { position: "absolute", right: 14, top: 14 },
  badgeFull: {
    backgroundColor: "rgba(239,68,68,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeFullText: { fontSize: 11, fontWeight: "900", color: theme.danger },
  badgeLim: {
    backgroundColor: "rgba(234,179,8,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeLimText: { fontSize: 11, fontWeight: "900", color: "#422006" },
  meta: { fontSize: 11, marginTop: 10, fontWeight: "600" },
  metaFull: { color: theme.textMutedOnLight },
  metaOpen: { color: "rgba(255,255,255,0.75)" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: theme.borderLight,
    gap: 4,
  },
});
