import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Platform, Pressable, RefreshControl, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiServiceLaneSummary, apiWalkIn, type ServiceLaneSummary } from "../api";
import type { BookingStackParamList } from "../navigation/navigationRef";
import { exitBookingFlow } from "../navigation/bookingExit";
import { useCustomer } from "../context/CustomerContext";
import { useBranchRealtime } from "../useBranchRealtime";
import { theme } from "../theme";
import { formatSlotRange } from "../utils/dateFormat";

type Props = NativeStackScreenProps<BookingStackParamList, "BookingServices">;

export function BookingServicesScreen({ navigation, route }: Props) {
  const { branch, returnTo } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { navigateToQueueTrack, token } = useCustomer();
  const [laneByService, setLaneByService] = useState<Record<string, ServiceLaneSummary>>({});
  const [listRefreshing, setListRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const filteredServices = useMemo(
    () => branch.services.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [branch.services, search],
  );

  const loadLanes = useCallback(async () => {
    const results = await Promise.allSettled(
      branch.services.map((s) => apiServiceLaneSummary(branch.id, s.id).then((r) => [s.id, r] as const)),
    );
    const next: Record<string, ServiceLaneSummary> = {};
    for (const r of results) {
      if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
    }
    setLaneByService(next);
  }, [branch]);

  useEffect(() => {
    void loadLanes();
    const id = setInterval(() => void loadLanes(), 10000);
    return () => clearInterval(id);
  }, [loadLanes]);

  useBranchRealtime({
    branchIds: useMemo(() => [branch.id], [branch.id]),
    enabled: true,
    accessToken: token,
    onEvent: loadLanes,
  });

  const onListRefresh = async () => {
    setListRefreshing(true);
    try {
      await loadLanes();
    } finally {
      setListRefreshing(false);
    }
  };

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
        <View style={styles.titleRow}>
          <Pressable onPress={() => exitBookingFlow(navigation, returnTo)} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>{branch.name}</Text>
        </View>
        <Text style={styles.sub}>Choose a service type to continue</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={theme.textMutedOnLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search service type..."
            placeholderTextColor={theme.textMutedOnLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.textMutedOnLight} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filteredServices}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={listRefreshing}
            onRefresh={() => void onListRefresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor="#1e293b"
          />
        }
        renderItem={({ item }) => {
          const lane = laneByService[item.id];
          const crowdLabel =
            lane == null ? "…" : lane.crowdLevel === "Low" ? "Low Crowd" : lane.crowdLevel === "Medium" ? "Medium" : "Busy";
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
                <View style={styles.svcIcon}>
                  <Ionicons name="briefcase-outline" size={20} color="#4a90d9" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.svcName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.avg}>~{item.defaultAvgServiceMinutes} min per visit</Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="people-outline" size={15} color="#4a90d9" />
                  <Text style={styles.statText}>
                    {lane ? `${lane.waitingCount} waiting` : "—"}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={15} color="#4a90d9" />
                  <Text style={styles.statText}>
                    {lane?.estimatedWaitMinutes == null ? "—" : `~${lane.estimatedWaitMinutes} min wait`}
                  </Text>
                </View>
                <View style={[styles.crowdChip, { backgroundColor: crowdColor + "18" }]}>
                  <View style={[styles.crowdDot, { backgroundColor: crowdColor }]} />
                  <Text style={[styles.crowdText, { color: crowdColor }]}>{crowdLabel}</Text>
                </View>
              </View>
              <View style={styles.dualBtns}>
                <Pressable
                  style={styles.bookBtn}
                  onPress={() => navigation.navigate("BookingSlots", { branch, service: item, returnTo })}
                >
                  <Ionicons name="calendar-outline" size={14} color="#fff" />
                  <Text style={styles.bookBtnText}>Book a Slot</Text>
                </Pressable>
                <Pressable
                  style={styles.walkInBtn}
                  onPress={() => void walkIn(item.id)}
                >
                  <Ionicons name="footsteps-outline" size={14} color={theme.primaryDark} />
                  <Text style={styles.walkInBtnText}>Walk-in</Text>
                </Pressable>
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
    paddingBottom: 30,
  },
  searchRow: {
    paddingHorizontal: 18,
    marginTop: -22,
    marginBottom: 6,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.textOnLight,
    padding: 0,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", color: "#fff" },
  sub: { color: "rgba(255,255,255,0.65)", marginTop: 4, fontSize: 13 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowTop: { flexDirection: "row", gap: 10, alignItems: "center" },
  svcIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#edf2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  svcName: { fontSize: 15, fontWeight: "700", color: theme.textOnLight },
  avg: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 3 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9",
  },
  statItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11, color: theme.textMutedOnLight, fontWeight: "600" },
  crowdChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  crowdDot: { width: 5, height: 5, borderRadius: 2.5 },
  crowdText: { fontSize: 10, fontWeight: "700" },
  dualBtns: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9",
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.primaryDark,
  },
  bookBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  walkInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  walkInBtnText: { fontSize: 12, fontWeight: "700", color: theme.primaryDark },
});
