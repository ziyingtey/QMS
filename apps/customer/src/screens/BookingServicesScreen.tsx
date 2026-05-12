import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Alert, FlatList, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiServiceLaneSummary, apiWalkIn, type ServiceLaneSummary } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import type { BookingStackParamList } from "../navigation/navigationRef";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";
import { formatSlotRange } from "../utils/dateFormat";

type Props = NativeStackScreenProps<BookingStackParamList, "BookingServices">;

export function BookingServicesScreen({ navigation, route }: Props) {
  const { branch } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { navigateToQueueTrack } = useCustomer();
  const [laneByService, setLaneByService] = useState<Record<string, ServiceLaneSummary>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, ServiceLaneSummary> = {};
      for (const s of branch.services) {
        try {
          next[s.id] = await apiServiceLaneSummary(branch.id, s.id);
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setLaneByService(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [branch]);

  const walkIn = async (serviceId: string) => {
    const svc = branch.services.find((s) => s.id === serviceId);
    if (!svc) return;
    try {
      const res = await apiWalkIn(branch.id, svc.id);
      const pool = formatSlotRange(res.walkInCapacitySlotStart, res.walkInCapacitySlotEnd);
      Alert.alert("Walk-in ticket", `Ticket ${res.ticketNumber}\nWalk-in pool: ${pool}`, [
        { text: "View queue", onPress: () => navigateToQueueTrack(branch.id, res.ticketNumber) },
      ]);
    } catch (e) {
      Alert.alert("Walk-in", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <Pressable style={styles.back} onPress={() => navigation.navigate("BookingBranches")}>
        <Ionicons name="arrow-back" size={22} color={theme.accent} />
        <Text style={styles.backText}>All branches</Text>
      </Pressable>
      <Text style={styles.title}>{branch.name}</Text>
      <Text style={styles.sub}>Pick a service · book a slot or join walk-in queue</Text>

      <FlatList
        data={branch.services}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item }) => {
          const lane = laneByService[item.id];
          return (
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.iconCircle}>
                  <Ionicons name="layers-outline" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.svcName}>{item.name}</Text>
                  <Text style={styles.avg}>Avg time · ~{item.defaultAvgServiceMinutes} min</Text>
                </View>
              </View>
              {lane ? (
                <View style={styles.stats}>
                  <Text style={styles.statChip}>Crowd {lane.crowdLevel}</Text>
                  <Text style={styles.statChip}>Wait {lane.waitingCount}</Text>
                  <Text style={styles.statChip}>ETA {lane.estimatedWaitMinutes ?? "—"}m</Text>
                </View>
              ) : (
                <Text style={styles.muted}>Loading lane stats…</Text>
              )}
              <View style={styles.dualBtns}>
                <PrimaryButton
                  label="BOOK SLOT"
                  compact
                  icon="calendar-outline"
                  onPress={() => navigation.navigate("BookingSlots", { branch, service: item })}
                />
                <PrimaryButton
                  label="WALK-IN TICKET"
                  variant="ghost"
                  compact
                  icon="footsteps-outline"
                  onPress={() => void walkIn(item.id)}
                />
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
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  backText: { color: theme.accent, fontWeight: "700", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  sub: { color: theme.textMuted, marginBottom: 12 },
  card: {
    backgroundColor: theme.bgCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  svcName: { fontSize: 17, fontWeight: "700", color: theme.text },
  avg: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  statChip: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.accent,
    backgroundColor: theme.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  muted: { color: theme.textMuted, marginTop: 10 },
  dualBtns: { flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" },
});
