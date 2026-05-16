import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiQueueStatus, apiServiceLaneSummary, type ServiceLaneSummary } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import { navigationRef } from "../navigation/navigationRef";
import { theme } from "../theme";
import { formatBookingSlotDateTime, defaultBranchOffsetMinutes } from "../utils/dateFormat";
import { distanceMeters, formatDistance } from "../utils/geo";

type SortMode = "distance" | "wait" | "name" | "services";

function openBranchMap() {
  if (navigationRef.isReady()) navigationRef.navigate("MapBranches");
}

function openBranchDetail(branch: import("../api").BranchDto) {
  if (navigationRef.isReady()) navigationRef.navigate("BranchDetail", { branch });
}

export function HomeScreen({
  navigation,
}: {
  navigation: {
    navigate: (...args: unknown[]) => void;
    getParent: () => { navigate: (n: string, p?: object) => void } | undefined;
  };
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const {
    userEmail,
    profile,
    branches,
    bookings,
    userCoords,
    userLocationLabel,
    busy,
    loadBranches,
    requestLocation,
    locationBusy,
    toggleFavoriteBranch,
    togglingFavoriteBranchId,
    refreshBookings,
    refreshProfile,
    navigateToQueueTrack,
  } = useCustomer();
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [serviceFilter, setServiceFilter] = useState<string>("__all__");
  const [activeStatus, setActiveStatus] = useState<Awaited<ReturnType<typeof apiQueueStatus>> | null>(null);
  const [waitByBranchId, setWaitByBranchId] = useState<Record<string, number | null>>({});

  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    void refreshBookings();
  }, [refreshBookings]);

  const onHomeRefresh = useCallback(async () => {
    setHomeRefreshing(true);
    try {
      await Promise.all([loadBranches(), refreshBookings(), refreshProfile(), requestLocation()]);
    } finally {
      setHomeRefreshing(false);
    }
  }, [loadBranches, refreshBookings, refreshProfile, requestLocation]);

  const primaryBooking = bookings.find(
    (b) => b.ticketNumber && b.status !== "Cancelled" && b.status !== "Completed" && b.status !== "NoShow",
  );

  const primaryBookingBranchOffset = useMemo(() => {
    if (!primaryBooking) return defaultBranchOffsetMinutes;
    return branches.find((b) => b.id === primaryBooking.branchId)?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
  }, [primaryBooking, branches]);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, number | null> = {};
      await Promise.all(
        branches.map(async (b) => {
          let minWait: number | null = null;
          for (const s of b.services) {
            try {
              const lane = await apiServiceLaneSummary(b.id, s.id);
              const w = lane.estimatedWaitMinutes;
              if (w != null) minWait = minWait == null ? w : Math.min(minWait, w);
            } catch {
              /* skip */
            }
          }
          next[b.id] = minWait;
        }),
      );
      if (!cancelled) setWaitByBranchId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [branches]);

  const serviceFilterOptions = useMemo(() => {
    const names = new Set<string>();
    branches.forEach((b) => b.services.forEach((s) => names.add(s.name)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [branches]);

  const baseFiltered = branches.filter((b) => {
    const q = search.trim().toLowerCase();
    if (q && !b.name.toLowerCase().includes(q) && !(b.address ?? "").toLowerCase().includes(q)) return false;
    if (serviceFilter !== "__all__" && !b.services.some((s) => s.name === serviceFilter)) return false;
    return true;
  });

  const scored = baseFiltered.map((b) => ({
    branch: b,
    dist:
      userCoords != null ? distanceMeters(userCoords.latitude, userCoords.longitude, b.latitude, b.longitude) : null,
    wait: waitByBranchId[b.id] ?? null,
  }));

  const favIds = profile?.favoriteBranchIds ?? [];
  const sorted = [...scored].sort((a, b) => {
    const pa = favIds.includes(a.branch.id);
    const pb = favIds.includes(b.branch.id);
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    if (sortMode === "name") return a.branch.name.localeCompare(b.branch.name);
    if (sortMode === "services") return b.branch.services.length - a.branch.services.length;
    if (sortMode === "wait") {
      const wa = a.wait;
      const wb = b.wait;
      if (wa == null && wb == null) return (a.dist ?? 1e12) - (b.dist ?? 1e12);
      if (wa == null) return 1;
      if (wb == null) return -1;
      if (wa !== wb) return wa - wb;
    }
    if (a.dist == null && b.dist == null) return a.branch.name.localeCompare(b.branch.name);
    if (a.dist == null) return 1;
    if (b.dist == null) return -1;
    return a.dist - b.dist;
  });

  const rawHello = profile?.name?.trim() || userEmail?.split("@")[0] || "there";
  const helloName = rawHello.length > 0 ? rawHello.charAt(0).toUpperCase() + rawHello.slice(1) : "there";
  const recommend = sorted[0]?.branch;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 18 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={homeRefreshing}
            onRefresh={() => void onHomeRefresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor="#1e293b"
          />
        }
      >
        <View style={[styles.headerBlock, { marginHorizontal: -18, paddingHorizontal: 18 }]}>
          <View style={styles.headerRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{helloName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>Hello {helloName}!</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={[styles.addressLine, { flex: 1 }]} numberOfLines={3}>
                  {locationBusy ? "Getting GPS…" : userLocationLabel ?? "Fetching your location…"}
                </Text>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "How distance works",
                      "Distances use your phone’s latest GPS fix (Expo Location) vs each branch’s coordinates.\n\n" +
                        "• Pull down on this screen to refresh lists and update your location.\n" +
                        "• Real phone: turn on Location services.\n" +
                        "• Android Emulator: open ⋯ (Extended controls) → Location, set Lat/Long to where you want to simulate, then pull to refresh.",
                    )
                  }
                  hitSlop={6}
                  style={({ pressed }) => [styles.gpsChip, { backgroundColor: "rgba(255,255,255,0.22)" }, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name="help-circle-outline" size={16} color="#fff" />
                </Pressable>
              </View>
              <Text style={styles.phoneLine}>{profile?.phone?.trim() || "Customer account"}</Text>
            </View>
            <View style={styles.headerIcons}>
              <Pressable
                accessibilityLabel="Notifications"
                onPress={() => Alert.alert("Notifications", "Ticket reminders can be wired to push in a later iteration.")}
                style={styles.iconBtn}
                hitSlop={8}
              >
                <Ionicons name="notifications-outline" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a branch…"
              placeholderTextColor={theme.textMutedOnLight}
              value={search}
              onChangeText={setSearch}
            />
            <Pressable accessibilityLabel="Voice search" onPress={() => Alert.alert("Voice search", "Not enabled in this build.")} hitSlop={8}>
              <Ionicons name="mic-outline" size={22} color="#64748b" />
            </Pressable>
            <Pressable accessibilityLabel="Locate on map" onPress={openBranchMap} hitSlop={8}>
              <Ionicons name="location-outline" size={22} color={theme.primaryDark} />
            </Pressable>
          </View>
        </View>

        {primaryBooking?.ticketNumber ? (
          <Pressable
            style={styles.activeCard}
            onPress={() => navigateToQueueTrack(primaryBooking.branchId, primaryBooking.ticketNumber!, primaryBooking.id)}
          >
            <Text style={styles.activeCardLabel}>Your current ticket</Text>
            <Text style={styles.activeTicket}>{primaryBooking.ticketNumber}</Text>
            <Text style={styles.activeSlot}>
              {formatBookingSlotDateTime(primaryBooking.slotStart, primaryBooking.slotEnd, primaryBookingBranchOffset)}
            </Text>
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
            <Text style={styles.activeTap}>More details →</Text>
          </Pressable>
        ) : (
          <View style={[styles.activeCard, { opacity: 0.9 }]}>
            <Text style={styles.activeCardLabel}>No active ticket</Text>
            <Text style={styles.activeMeta}>Book a slot or take a walk-in from the Booking tab.</Text>
          </View>
        )}

        <View style={styles.promoBanner}>
          <Ionicons name="sparkles-outline" size={18} color="#e9d5ff" />
          <Text style={styles.promoText}>
            Branch recommendations: {recommend?.name ?? "—"}
            {userCoords ? "" : " · enable GPS for distance-based picks"}
          </Text>
        </View>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort</Text>
          {(
            [
              ["distance", "Distance"],
              ["wait", "Wait"],
              ["services", "Services"],
              ["name", "A–Z"],
            ] as const
          ).map(([key, label]) => {
            const on = sortMode === key;
            return (
              <Pressable key={key} onPress={() => setSortMode(key)} style={[styles.sortChip, on && styles.sortChipOn]}>
                <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {serviceFilterOptions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <Pressable
              onPress={() => setServiceFilter("__all__")}
              style={[styles.filterChip, serviceFilter === "__all__" && styles.filterChipOn]}
            >
              <Text style={[styles.filterChipText, serviceFilter === "__all__" && styles.filterChipTextOn]}>All services</Text>
            </Pressable>
            {serviceFilterOptions.map((n) => {
              const on = serviceFilter === n;
              return (
                <Pressable key={n} onPress={() => setServiceFilter(n)} style={[styles.filterChip, on && styles.filterChipOn]}>
                  <Text style={[styles.filterChipText, on && styles.filterChipTextOn]} numberOfLines={1}>
                    {n}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Nearby branches</Text>
          <Pressable onPress={() => navigation.navigate("Booking" as never, { screen: "BookingBranches" } as never)}>
            <Text style={styles.viewAll}>View all</Text>
          </Pressable>
        </View>

        {busy && branches.length === 0 ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} /> : null}

        {sorted.map(({ branch: b, dist }) => (
          <NearbyBranchCard
            key={b.id}
            branch={b}
            distanceLabel={dist != null ? formatDistance(dist) : userCoords ? "—" : "Enable location"}
            isFavorite={favIds.includes(b.id)}
            favoriteBusy={togglingFavoriteBranchId === b.id}
            onToggleFavorite={() => void toggleFavoriteBranch(b.id)}
            onOpenDetail={() => openBranchDetail(b)}
            onBook={() =>
              navigation.navigate(
                "Booking" as never,
                {
                  screen: "BookingServices",
                  params: { branch: b },
                } as never,
              )
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

function NearbyBranchCard({
  branch,
  distanceLabel,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onBook,
  onOpenDetail,
}: {
  branch: import("../api").BranchDto;
  distanceLabel: string;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  onBook: () => void;
  onOpenDetail: () => void;
}) {
  const [lane, setLane] = useState<ServiceLaneSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = branch.services[0];
      if (!first) return;
      try {
        const s = await apiServiceLaneSummary(branch.id, first.id);
        if (!cancelled) setLane(s);
      } catch {
        if (!cancelled) setLane(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch.id, branch.services]);

  const crowd =
    lane == null ? "…" : lane.crowdLevel === "Low" ? "Low Crowd" : lane.crowdLevel === "Medium" ? "Medium Crowd" : "Busy";
  const crowdColor =
    lane == null ? theme.textMutedOnLight : lane.crowdLevel === "Low" ? theme.success : lane.crowdLevel === "Medium" ? theme.warning : theme.danger;

  return (
    <View style={styles.branchCard}>
      <Pressable style={styles.branchMainPress} onPress={onOpenDetail}>
        {branch.imageUrl ? (
          <Image source={{ uri: branch.imageUrl }} style={styles.branchThumbImg} />
        ) : (
          <View style={styles.branchThumb}>
            <Ionicons name="business" size={28} color={theme.primary} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={styles.branchName}>{branch.name}</Text>
            {isFavorite ? (
              <View style={styles.prefPill}>
                <Text style={styles.prefPillText}>Favorite</Text>
              </View>
            ) : null}
          </View>
          {branch.address ? (
            <Text style={styles.branchAddr} numberOfLines={2}>
              {branch.address}
            </Text>
          ) : null}
          <Text style={styles.branchNear}>Near you: {distanceLabel}</Text>
          <Text style={[styles.crowdPill, { color: crowdColor }]}>{crowd}</Text>
        </View>
      </Pressable>
      <View style={styles.branchRight}>
        <Pressable
          accessibilityLabel={isFavorite ? "Remove branch from favorites" : "Add branch to favorites"}
          onPress={onToggleFavorite}
          disabled={favoriteBusy}
          style={({ pressed }) => [styles.heartBtn, pressed && { opacity: 0.75 }]}
          hitSlop={8}
        >
          <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={26} color={isFavorite ? "#e11d48" : theme.textMutedOnLight} />
        </Pressable>
        <Pressable
          accessibilityLabel="Branch details"
          onPress={onOpenDetail}
          style={({ pressed }) => [styles.infoBtn, pressed && { opacity: 0.85 }]}
          hitSlop={6}
        >
          <Ionicons name="information-circle-outline" size={24} color={theme.primaryDark} />
          <Text style={styles.infoBtnText}>Details</Text>
        </Pressable>
        <PrimaryButton label="Book" compact onPress={onBook} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
  headerBlock: {
    backgroundColor: theme.headerNavy,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 22, fontWeight: "800", color: "#fff" },
  hello: { fontSize: 22, fontWeight: "800", color: "#fff" },
  addressLine: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 6, lineHeight: 18 },
  phoneLine: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  gpsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerIcons: { alignItems: "flex-end", gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchInput: { flex: 1, color: theme.textOnLight, fontSize: 16 },
  activeCard: {
    backgroundColor: theme.primaryDark,
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
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
    marginBottom: 14,
  },
  promoText: { flex: 1, color: "#f5f3ff", fontSize: 13 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  sortLabel: { fontSize: 13, fontWeight: "800", color: theme.textMutedOnLight, marginRight: 4 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  sortChipOn: { backgroundColor: theme.primaryDark, borderColor: theme.primaryDark },
  sortChipText: { fontSize: 12, fontWeight: "700", color: theme.textMutedOnLight },
  sortChipTextOn: { color: "#fff" },
  filterScroll: { gap: 8, paddingBottom: 12, flexDirection: "row" },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.borderLight,
    maxWidth: 200,
  },
  filterChipOn: { borderColor: theme.primary, backgroundColor: "#e8eef9" },
  filterChipText: { fontSize: 12, fontWeight: "600", color: theme.textMutedOnLight },
  filterChipTextOn: { color: theme.primaryDark, fontWeight: "800" },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: theme.textOnLight },
  viewAll: { color: theme.primaryDark, fontWeight: "700", fontSize: 14 },
  branchCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 10,
  },
  branchMainPress: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  branchThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#e8eef9",
    alignItems: "center",
    justifyContent: "center",
  },
  branchThumbImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: "#e8eef9" },
  branchName: { fontSize: 16, fontWeight: "700", color: theme.textOnLight },
  branchAddr: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 4, lineHeight: 16 },
  branchNear: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 4, fontWeight: "600" },
  crowdPill: { fontSize: 12, fontWeight: "700", marginTop: 6 },
  branchRight: { alignItems: "center", justifyContent: "center", gap: 8, paddingLeft: 4 },
  heartBtn: { padding: 4 },
  infoBtn: { alignItems: "center", paddingVertical: 4 },
  infoBtnText: { fontSize: 10, fontWeight: "800", color: theme.primaryDark, marginTop: 2 },
  prefPill: {
    backgroundColor: "rgba(34,197,94,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  prefPillText: { fontSize: 10, fontWeight: "800", color: theme.success },
});
