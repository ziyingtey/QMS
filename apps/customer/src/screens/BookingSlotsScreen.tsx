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

function slotStatusColor(status: string) {
  if (status === "Full") return theme.danger;
  if (status === "Limited") return theme.warning;
  return theme.success;
}

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
  const [loadedDay, setLoadedDay] = useState<string | null>(null);

  const calendarCells = useMemo(
    () => buildMonthGrid(viewYmd.y, viewYmd.m0, minYmd),
    [viewYmd.y, viewYmd.m0, minYmd],
  );
  const calendarRows = useMemo(() => chunk(calendarCells, 7), [calendarCells]);

  useEffect(() => {
    setSelectedYmd(minYmd);
    setViewYmd(parseYmd(minYmd));
  }, [branch.id, minYmd]);

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
    if (slot.status === "Full") {
      Alert.alert("Full", "This window is full online; walk-in buffer may still exist at branch.");
      return;
    }
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

  return (
    <ScrollView style={[styles.screen, { paddingTop: topPad }]} contentContainerStyle={{ paddingBottom: 100 }}>
      <StatusBar style="light" />
      <Pressable style={styles.back} onPress={() => navigation.navigate("BookingServices", { branch })}>
        <Text style={styles.backText}>← Services</Text>
      </Pressable>
      <Text style={styles.title}>{rescheduleId ? "Reschedule" : "Book appointment"}</Text>
      <Text style={styles.sectionLabel}>Pick date and time</Text>
      <Text style={styles.sub}>{service.name}</Text>

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
        {!busy && loadedDay && loadedDay !== selectedYmd ? " (loaded alternate day — see note)" : ""}
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
      {slots.map((slot) => (
        <Pressable
          key={slot.slotStart}
          style={[styles.slotCard, slot.status === "Full" && { opacity: 0.5 }]}
          onPress={() => void bookSlot(slot)}
        >
          <Text style={styles.slotTime}>{formatSlotRange(slot.slotStart, slot.slotEnd)}</Text>
          <Text style={[styles.slotStatus, { color: slotStatusColor(slot.status) }]}>{slot.status}</Text>
          <Text style={styles.meta}>
            Online {slot.onlineUsed}/{slot.onlineCapacity} · Walk-in {slot.walkInUsed}/{slot.walkInCapacity}
          </Text>
        </Pressable>
      ))}
      <PrimaryButton label="Cancel" variant="danger" onPress={() => navigation.navigate("BookingServices", { branch })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 18 },
  back: { marginBottom: 8 },
  backText: { color: theme.accent, fontWeight: "700", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  sectionLabel: { fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 4 },
  sub: { color: theme.textMuted, marginBottom: 10 },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calNav: { paddingHorizontal: 12, paddingVertical: 6 },
  calNavText: { fontSize: 22, color: theme.accent, fontWeight: "800" },
  calTitle: { fontSize: 17, fontWeight: "700", color: theme.text },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: theme.textMuted },
  dayRow: { flexDirection: "row", marginBottom: 4 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    marginHorizontal: 2,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dayCellMuted: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    opacity: 0.45,
  },
  dayCellSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primaryDark,
  },
  dayCellText: { fontSize: 15, fontWeight: "700", color: theme.text },
  dayCellTextMuted: { color: theme.textMuted },
  dayCellTextSelected: { color: "#fff" },
  hintMuted: { fontSize: 11, color: theme.textMuted, marginBottom: 14, marginTop: 4 },
  slotsHeading: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 },
  muted: { color: theme.textMuted, marginVertical: 12 },
  slotCard: {
    backgroundColor: theme.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  slotTime: { fontSize: 17, fontWeight: "700", color: theme.text },
  slotStatus: { fontSize: 14, fontWeight: "800", marginTop: 6 },
  meta: { fontSize: 12, color: theme.textMuted, marginTop: 8 },
});
