import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiBranches, apiQueueStatus, apiServiceLaneSummary, type ServiceLaneSummary } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";
import { formatBookingSlotDateTime } from "../utils/dateFormat";
import { navigationRef } from "../navigation/navigationRef";
import { distanceMeters, formatDistance } from "../utils/geo";

function openBranchMap() {
  if (navigationRef.isReady()) navigationRef.navigate("MapBranches");
}

export function HomeScreen({ navigation }: { navigation: { navigate: (...args: unknown[]) => void; getParent: () => { navigate: (n: string) => void } | undefined } }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const {
    userEmail,
    branches,
    bookings,
    userCoords,
    userLocationLabel,
    busy,
    loadBranches,
    requestLocation,
    refreshBookings,
    navigateToQueueTrack,
  } = useCustomer();
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<Awaited<ReturnType<typeof apiQueueStatus>> | null>(null);

  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    void refreshBookings();
  }, [refreshBookings]);

  const primaryBooking = bookings.find(
    (b) => b.ticketNumber && b.status !== "Cancelled" && b.status !== "Completed" && b.status !== "NoShow",
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!primaryBooking?.ticketNumber) {
        setActiveStatus(null);
        return;
      }
      try {
        const st = await apiQueueStatus(primaryBooking.branchId, primaryBooking.ticketNumber);
        if (!cancelled) setActiveStatus(st);
      } catch {
        if (!cancelled) setActiveStatus(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [primaryBooking?.branchId, primaryBooking?.ticketNumber]);

  const filtered = branches
    .filter((b) => (search.trim() ? b.name.toLowerCase().includes(search.trim().toLowerCase()) : true))
    .map((b) => ({
      branch: b,
      dist:
        userCoords != null ? distanceMeters(userCoords.latitude, userCoords.longitude, b.latitude, b.longitude) : null,
    }))
    .sort((a, b) => {
      if (a.dist == null && b.dist == null) return a.branch.name.localeCompare(b.branch.name);
      if (a.dist == null) return 1;
      if (b.dist == null) return -1;
      return a.dist - b.dist;
    });

  const rawHello = userEmail?.split("@")[0] ?? "there";
  const helloName = rawHello.length > 0 ? rawHello.charAt(0).toUpperCase() + rawHello.slice(1) : "there";
  const recommend = filtered[0]?.branch;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{helloName.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Hello {helloName}!</Text>
            <Text style={styles.addressLine} numberOfLines={2}>
              {userLocationLabel ?? "Fetching your location…"}
            </Text>
            <Text style={styles.phoneLine}>Customer account · add phone in a future profile update</Text>
          </View>
          <View style={styles.headerIcons}>
            <Pressable
              accessibilityLabel="Notifications"
              onPress={() => Alert.alert("Notifications", "Alerts when your ticket is almost due can be added later.")}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={22} color={theme.text} />
            </Pressable>
            <Pressable accessibilityLabel="Open map" onPress={openBranchMap} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="map-outline" size={22} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a branch…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <Pressable
            accessibilityLabel="Voice search"
            onPress={() => Alert.alert("Voice search", "Not enabled in this build.")}
            hitSlop={8}
          >
            <Ionicons name="mic-outline" size={22} color="#64748b" />
          </Pressable>
          <Pressable accessibilityLabel="Locate on map" onPress={openBranchMap} hitSlop={8}>
            <Ionicons name="location-outline" size={22} color={theme.primary} />
          </Pressable>
        </View>

        {primaryBooking?.ticketNumber ? (
          <Pressable
            style={styles.activeCard}
            onPress={() => navigateToQueueTrack(primaryBooking.branchId, primaryBooking.ticketNumber!)}
          >
            <Text style={styles.activeCardLabel}>Your queue ticket</Text>
            <Text style={styles.activeTicket}>{primaryBooking.ticketNumber}</Text>
            <Text style={styles.activeSlot}>{formatBookingSlotDateTime(primaryBooking.slotStart, primaryBooking.slotEnd)}</Text>
            <View style={styles.activeRow}>
              <Text style={styles.activeMeta}>
                Now serving: <Text style={{ color: theme.accent }}>{activeStatus?.currentServingTicketNumber ?? "—"}</Text>
              </Text>
              <Text style={styles.activeMeta}>
                Est. wait:{" "}
                <Text style={{ color: theme.warning }}>
                  {activeStatus?.estimatedWaitMinutes == null ? "—" : `${activeStatus.estimatedWaitMinutes} min`}
                </Text>
              </Text>
            </View>
            <Text style={styles.activeTap}>Tap for live queue status →</Text>
          </Pressable>
        ) : (
          <View style={[styles.activeCard, { opacity: 0.85 }]}>
            <Text style={styles.activeCardLabel}>No active ticket</Text>
            <Text style={styles.activeMeta}>Book a slot or take a walk-in from the Booking tab.</Text>
          </View>
        )}

        <View style={styles.promoBanner}>
          <Ionicons name="sparkles-outline" size={18} color="#e9d5ff" />
          <Text style={styles.promoText}>
            Branch recommendation: {recommend?.name ?? "—"}
            {userCoords ? "" : " · enable GPS for distance-based picks"}
          </Text>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Nearby branches</Text>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <Pressable onPress={() => navigation.navigate("Booking" as never, { screen: "BookingBranches" } as never)}>
              <Text style={styles.viewAll}>View all</Text>
            </Pressable>
            <Pressable onPress={() => void loadBranches()} disabled={busy}>
              <Text style={styles.refreshLink}>{busy ? "…" : "Refresh"}</Text>
            </Pressable>
          </View>
        </View>

        {busy && branches.length === 0 ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} /> : null}

        {filtered.map(({ branch: b, dist }) => (
          <NearbyBranchCard
            key={b.id}
            name={b.name}
            address={b.address}
            distanceLabel={dist != null ? formatDistance(dist) : userCoords ? "—" : "Enable location"}
            branchId={b.id}
            onBook={() =>
              navigation.navigate(
                "Booking" as never,
                {
                  screen: "BookingServices",
                  params: { branch: b },
                } as never,
              )
            }
            onOpenMap={openBranchMap}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function NearbyBranchCard({
  name,
  address,
  distanceLabel,
  branchId,
  onBook,
  onOpenMap,
}: {
  name: string;
  address?: string;
  distanceLabel: string;
  branchId: string;
  onBook: () => void;
  onOpenMap: () => void;
}) {
  const [lane, setLane] = useState<ServiceLaneSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiBranches();
        const b = list.find((x) => x.id === branchId);
        const first = b?.services[0];
        if (!first) return;
        const s = await apiServiceLaneSummary(branchId, first.id);
        if (!cancelled) setLane(s);
      } catch {
        if (!cancelled) setLane(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const crowd =
    lane == null ? "…" : lane.crowdLevel === "Low" ? "Low Crowd" : lane.crowdLevel === "Medium" ? "Medium Crowd" : "Busy";
  const crowdColor =
    lane == null ? theme.textMuted : lane.crowdLevel === "Low" ? theme.success : lane.crowdLevel === "Medium" ? theme.warning : theme.danger;

  return (
    <View style={styles.branchCard}>
      <View style={styles.branchThumb}>
        <Ionicons name="business" size={28} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.branchName}>{name}</Text>
        {address ? (
          <Text style={styles.branchAddr} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
        <Text style={styles.branchNear}>Near You: {distanceLabel}</Text>
        <Text style={[styles.crowdPill, { color: crowdColor }]}>{crowd}</Text>
      </View>
      <View style={styles.branchActions}>
        <Pressable onPress={onOpenMap} style={styles.mapMini}>
          <Ionicons name="map-outline" size={18} color={theme.accent} />
        </Pressable>
        <PrimaryButton label="Book a turn" compact onPress={onBook} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 18 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18, gap: 12 },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bgCard,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 22, fontWeight: "800", color: theme.text },
  hello: { fontSize: 22, fontWeight: "800", color: theme.text },
  addressLine: { fontSize: 13, color: theme.textMuted, marginTop: 6, lineHeight: 18 },
  phoneLine: { fontSize: 12, color: theme.textMuted, opacity: 0.75, marginTop: 4 },
  headerIcons: { alignItems: "flex-end", gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.bgCard,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchInput: { flex: 1, color: "#0f172a", fontSize: 16 },
  activeCard: {
    backgroundColor: theme.primaryDark,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  activeCardLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  activeTicket: { fontSize: 34, fontWeight: "900", color: "#fff", letterSpacing: 2, marginVertical: 8 },
  activeSlot: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.92)", marginBottom: 4 },
  activeRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  activeMeta: { color: "rgba(255,255,255,0.9)", fontSize: 13 },
  activeTap: { marginTop: 10, fontSize: 12, color: theme.accent, fontWeight: "600" },
  promoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.promoBanner,
    padding: 12,
    borderRadius: 14,
    marginBottom: 18,
  },
  promoText: { flex: 1, color: "#f5f3ff", fontSize: 13 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  viewAll: { color: theme.primary, fontWeight: "700", fontSize: 14 },
  refreshLink: { color: theme.accent, fontWeight: "600" },
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 12,
  },
  branchThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#e8eef9",
    alignItems: "center",
    justifyContent: "center",
  },
  branchName: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  branchAddr: { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 16 },
  branchNear: { fontSize: 12, color: "#64748b", marginTop: 4, fontWeight: "600" },
  crowdPill: { fontSize: 12, fontWeight: "700", marginTop: 6 },
  branchActions: { alignItems: "flex-end", gap: 8 },
  mapMini: { padding: 6 },
});
