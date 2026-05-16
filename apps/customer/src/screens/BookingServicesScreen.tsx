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
      const pool = formatSlotRange(res.walkInCapacitySlotStart, res.walkInCapacitySlotEnd, branch.serviceZoneOffsetMinutes);
      Alert.alert("Walk-in ticket", `Ticket ${res.ticketNumber}\nWalk-in pool: ${pool}`, [
        { text: "View queue", onPress: () => navigateToQueueTrack(branch.id, res.ticketNumber) },
      ]);
    } catch (e) {
      Alert.alert("Walk-in", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Pressable style={styles.back} onPress={() => navigation.navigate("BookingBranches")}>
          <Ionicons name="arrow-back" size={22} color={theme.accent} />
          <Text style={styles.backText}>All branches</Text>
        </Pressable>
        <Text style={styles.title}>{branch.name}</Text>
        <Text style={styles.sub}>Choose a service type to continue</Text>
      </View>

      <FlatList
        data={branch.services}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const lane = laneByService[item.id];
          const crowdLabel =
            lane == null ? "…" : lane.crowdLevel === "Low" ? "Low Crowd" : lane.crowdLevel === "Medium" ? "Medium Crowd" : "Busy";
          const crowdColor =
            lane == null
              ? theme.textMutedOnLight
              : lane.crowdLevel === "Low"
                ? theme.success
                : lane.crowdLevel === "Medium"
                  ? theme.warning
                  : theme.danger;
          return (
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.docCircle}>
                  <Ionicons name="document-text" size={22} color="#b91c1c" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.svcName}>{item.name}</Text>
                  <Text style={styles.avg}>Avg time: {item.defaultAvgServiceMinutes} mins</Text>
                  <View style={styles.metrics}>
                    <Text style={[styles.crowdTag, { color: crowdColor }]}>{crowdLabel}</Text>
                    <Text style={styles.waitHint}>
                      Wait: {lane?.estimatedWaitMinutes == null ? "~—" : `~${lane.estimatedWaitMinutes} mins`}
                    </Text>
                  </View>
                </View>
              </View>
              {lane ? (
                <Text style={styles.queueMeta}>{lane.waitingCount} customer(s) in this lane</Text>
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
  screen: { flex: 1, backgroundColor: theme.screenBg },
  header: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  backText: { color: theme.accent, fontWeight: "700", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "800", color: "#fff" },
  sub: { color: "rgba(255,255,255,0.85)", marginTop: 6 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rowTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  docCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  svcName: { fontSize: 17, fontWeight: "700", color: theme.textOnLight },
  avg: { fontSize: 13, color: theme.textMutedOnLight, marginTop: 4 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8, alignItems: "center" },
  crowdTag: { fontSize: 13, fontWeight: "800" },
  waitHint: { fontSize: 13, fontWeight: "700", color: theme.primaryDark },
  queueMeta: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 8 },
  muted: { color: theme.textMutedOnLight, marginTop: 10 },
  dualBtns: { flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" },
});
