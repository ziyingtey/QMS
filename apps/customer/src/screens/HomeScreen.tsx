import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useCustomer } from "../context/CustomerContext";
import { useMapsDistance } from "../hooks/useMapsDistance";
import { navigationRef } from "../navigation/navigationRef";
import { theme } from "../theme";
import { formatBookingSlotDateTime, defaultBranchOffsetMinutes } from "../utils/dateFormat";
import {
  distanceMeters,
  effectiveDistanceSortMeters,
  formatBranchTravelLabel,
  type MapsDistanceResult,
} from "../utils/geo";

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
  const { distances: mapsDistances } = useMapsDistance(userCoords, branches);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [serviceFilter, setServiceFilter] = useState<string>("__all__");
  const [showFilters, setShowFilters] = useState(false);
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

  const primaryBookingBranch = useMemo(
    () => (primaryBooking ? branches.find((b) => b.id === primaryBooking.branchId) : undefined),
    [primaryBooking, branches],
  );
  const primaryBookingBranchOffset = primaryBookingBranch?.serviceZoneOffsetMinutes ?? defaultBranchOffsetMinutes;
  const primaryBookingServiceName = useMemo(() => {
    if (!primaryBooking || !primaryBookingBranch) return null;
    const svc = primaryBookingBranch.services.find((s) => s.id === primaryBooking.serviceTypeId);
    return svc?.name ?? null;
  }, [primaryBooking, primaryBookingBranch]);

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

  const scored = baseFiltered.map((b) => {
    const haversine =
      userCoords != null ? distanceMeters(userCoords.latitude, userCoords.longitude, b.latitude, b.longitude) : null;
    const mapsInfo = mapsDistances.get(b.id);
    return {
      branch: b,
      dist: effectiveDistanceSortMeters(mapsInfo, haversine),
      mapsInfo,
      haversine,
      wait: waitByBranchId[b.id] ?? null,
    };
  });

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
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={homeRefreshing}
            onRefresh={() => void onHomeRefresh()}
            tintColor="#ffffff"
            colors={["#ffffff"]}
            progressBackgroundColor={theme.headerNavy}
          />
        }
      >
        {/* Navy header — ends at half of search bar */}
        <View style={[styles.headerBlock, { marginHorizontal: -18, paddingHorizontal: 18, paddingTop: topPad }]}>
          <View style={styles.headerRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{helloName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>Hello {helloName}!</Text>
              <Text style={styles.addressLine} numberOfLines={2}>
                {locationBusy ? "Getting GPS…" : userLocationLabel ?? "Fetching your location…"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Notifications"
              onPress={() => navigation.navigate("Notifications" as never)}
              style={styles.notifBtn}
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
        </View>

        {/* Search bar — overlaps navy/white boundary */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a branch…"
              placeholderTextColor={theme.textMutedOnLight}
              value={search}
              onChangeText={setSearch}
            />
            <Pressable accessibilityLabel="Locate on map" onPress={openBranchMap} hitSlop={8}>
              <Ionicons name="location-outline" size={18} color={theme.primaryDark} />
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="Filter"
            onPress={() => setShowFilters((v) => !v)}
            style={[styles.filterIconBtn, showFilters && styles.filterIconBtnOn]}
          >
            <Ionicons name="options-outline" size={22} color={theme.primaryDark} />
          </Pressable>
        </View>

        {/* Sort & filter chips — shown when filter icon is tapped */}
        {showFilters ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
            {serviceFilterOptions.length > 0 ? <View style={styles.chipDivider} /> : null}
            {serviceFilterOptions.length > 0 ? (
              <Pressable
                onPress={() => setServiceFilter("__all__")}
                style={[styles.filterChip, serviceFilter === "__all__" && styles.filterChipOn]}
              >
                <Text style={[styles.filterChipText, serviceFilter === "__all__" && styles.filterChipTextOn]}>All</Text>
              </Pressable>
            ) : null}
            {serviceFilterOptions.map((n) => {
              const on = serviceFilter === n;
              return (
                <Pressable key={n} onPress={() => setServiceFilter(n)} style={[styles.filterChip, on && styles.filterChipOn]}>
                  <Text style={[styles.filterChipText, on && styles.filterChipTextOn]} numberOfLines={1}>{n}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Active ticket */}
        {primaryBooking?.ticketNumber ? (
          <Pressable
            style={[
              styles.activeCard,
              Date.now() >= new Date(primaryBooking.slotStart).getTime() && activeStatus?.state === "Serving" && styles.activeCardServing,
              Date.now() >= new Date(primaryBooking.slotStart).getTime() && activeStatus?.state !== "Serving" && activeStatus?.peopleAhead === 0 && styles.activeCardNext,
            ]}
            onPress={() => navigateToQueueTrack(primaryBooking.branchId, primaryBooking.ticketNumber!, primaryBooking.id)}
          >
            <View style={styles.activeTopRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.activeCardLabel}>Your Current Ticket</Text>
                <Text style={styles.activeTicket} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                  {primaryBooking.ticketNumber}
                </Text>
                {(primaryBookingServiceName || primaryBookingBranch) ? (
                  <Text style={styles.activeServiceBranch} numberOfLines={1}>
                    {[primaryBookingServiceName, primaryBookingBranch?.name].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                <Text style={styles.activeSlot}>
                  {formatBookingSlotDateTime(primaryBooking.slotStart, primaryBooking.slotEnd, primaryBookingBranchOffset)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMutedOnLight} />
            </View>

            {/* Conditional content based on queue state */}
            {(() => {
              const slotStartTime = new Date(primaryBooking.slotStart).getTime();
              const now = Date.now();
              const slotNotStarted = now < slotStartTime;

              if (activeStatus?.state === "Serving") {
                return (
                  <View style={styles.activeStatusRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#3CA00E" />
                    <Text style={[styles.activeStatusTextLight, { color: "#3CA00E" }]}>
                      It's your turn now! Please proceed to Counter {activeStatus.counterNumber ?? "—"}.
                    </Text>
                  </View>
                );
              }
              if (!slotNotStarted && activeStatus != null && activeStatus.peopleAhead === 0) {
                return (
                  <View style={styles.activeStatusRow}>
                    <Ionicons name="alert-circle" size={18} color="#FE9C00" />
                    <Text style={[styles.activeStatusTextLight, { color: "#FE9C00" }]}>
                      You are next in line. Please be ready — you will be called shortly.
                    </Text>
                  </View>
                );
              }
              if (!slotNotStarted && activeStatus != null && activeStatus.peopleAhead > 0) {
                return (
                  <View style={styles.activeMetaRow}>
                    <View style={styles.activeMetaCol}>
                      <Text style={styles.activeMetaLabel}>Now serving</Text>
                      <Text style={styles.activeMetaValue}>
                        {activeStatus.currentServingTicketNumber ?? "—"}
                      </Text>
                    </View>
                    <View style={styles.activeMetaDivider} />
                    <View style={styles.activeMetaCol}>
                      <Text style={styles.activeMetaLabel}>Est. wait</Text>
                      <Text style={styles.activeMetaValue}>
                        {activeStatus.estimatedWaitMinutes == null ? "—" : `${activeStatus.estimatedWaitMinutes} min`}
                      </Text>
                    </View>
                  </View>
                );
              }
              return (
                <View style={styles.activeStatusRow}>
                  <Ionicons name="time-outline" size={18} color="#FE9C00" />
                  <Text style={[styles.activeStatusTextLight, { color: "#FE9C00" }]}>
                    Please arrive 10 minutes before your appointment time.
                  </Text>
                </View>
              );
            })()}
          </Pressable>
        ) : (
          <Pressable
            style={styles.emptyTicketCard}
            onPress={() => navigation.navigate("Booking" as never, { screen: "BookingBranches" } as never)}
          >
            <View style={styles.emptyTicketIcon}>
              <Ionicons name="ticket-outline" size={20} color={theme.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyTicketTitle}>No active ticket</Text>
              <Text style={styles.emptyTicketSub}>Book a slot or walk in from the Booking tab</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8a8a8a" />
          </Pressable>
        )}

        {/* Recommendation — subtle inline hint */}
        {recommend ? (
          <View style={styles.recommendRow}>
            <Ionicons name="sparkles" size={14} color={theme.primary} />
            <Text style={styles.recommendText}>
              Recommended: <Text style={{ fontWeight: "700" }}>{recommend.name}</Text>
              {userCoords ? "" : " · enable GPS"}
            </Text>
          </View>
        ) : null}

        {/* Section header */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Nearby branches</Text>
          <Pressable onPress={() => navigation.navigate("Booking" as never, { screen: "BookingBranches" } as never)}>
            <Text style={styles.viewAll}>View all</Text>
          </Pressable>
        </View>

        {busy && branches.length === 0 ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} /> : null}

        {sorted.map(({ branch: b, mapsInfo, haversine }) => (
          <NearbyBranchCard
            key={b.id}
            branch={b}
            mapsInfo={mapsInfo}
            haversineMeters={haversine}
            noCoordsLabel={userCoords ? "—" : "Enable location"}
            isFavorite={favIds.includes(b.id)}
            favoriteBusy={togglingFavoriteBranchId === b.id}
            onToggleFavorite={() => void toggleFavoriteBranch(b.id)}
            onOpenDetail={() => openBranchDetail(b)}
            onBook={() =>
              navigation.navigate(
                "Booking" as never,
                {
                  screen: "BookingServices",
                  params: { branch: b, returnTo: "home" },
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
  mapsInfo,
  haversineMeters,
  noCoordsLabel,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  onBook,
  onOpenDetail,
}: {
  branch: import("../api").BranchDto;
  mapsInfo: MapsDistanceResult | undefined;
  haversineMeters: number | null;
  noCoordsLabel: string;
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

  const crowdLabel =
    lane == null ? null : lane.crowdLevel === "Low" ? "Low" : lane.crowdLevel === "Medium" ? "Medium" : "Busy";
  const crowdColor =
    lane == null ? theme.textMutedOnLight : lane.crowdLevel === "Low" ? theme.success : lane.crowdLevel === "Medium" ? theme.warning : theme.danger;

  const travelLine = formatBranchTravelLabel(mapsInfo, haversineMeters, { noCoordsLabel });
  const distIconName = mapsInfo ? "car-outline" : "navigate-circle-outline";

  return (
    <Pressable style={styles.branchCard} onPress={onOpenDetail}>
      {branch.imageUrl ? (
        <Image source={{ uri: branch.imageUrl }} style={styles.branchThumbImg} />
      ) : (
        <View style={styles.branchThumb}>
          <Ionicons name="location-outline" size={24} color={theme.primaryDark} />
        </View>
      )}
      <View style={styles.branchInfo}>
        <View style={styles.branchTopRow}>
          <Text style={styles.branchName} numberOfLines={1}>{branch.name}</Text>
          <Pressable
            accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onPress={onToggleFavorite}
            disabled={favoriteBusy}
            hitSlop={8}
          >
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={22} color={isFavorite ? "#e11d48" : "#cbd5e1"} />
          </Pressable>
        </View>
        {branch.address ? (
          <Text style={styles.branchAddr} numberOfLines={1}>{branch.address}</Text>
        ) : null}
        <View style={styles.branchMetaRow}>
          <View style={styles.branchMetaItem}>
            <Ionicons name={distIconName} size={13} color="#4a90d9" />
            <Text style={styles.branchMetaText} numberOfLines={2}>{travelLine}</Text>
          </View>
          {crowdLabel ? (
            <View style={styles.branchMetaItem}>
              <View style={[styles.crowdDot, { backgroundColor: crowdColor }]} />
              <Text style={[styles.branchMetaText, { color: crowdColor, fontWeight: "700" }]}>{crowdLabel}</Text>
            </View>
          ) : null}
          <Pressable style={styles.bookBtn} onPress={onBook}>
            <Text style={styles.bookBtnText}>Book</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
  scrollView: { flex: 1, backgroundColor: theme.screenBg },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 110,
    paddingHorizontal: 18,
    backgroundColor: theme.screenBg,
  },
  /* Header — navy bg, straight bottom edge, ends at half of search bar */
  headerBlock: {
    backgroundColor: theme.headerNavy,
    paddingBottom: 30,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 0, gap: 12 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 18, fontWeight: "800", color: "#fff" },
  hello: { fontSize: 18, fontWeight: "800", color: "#fff" },
  addressLine: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3, lineHeight: 16 },
  notifBtn: { padding: 8 },
  /* Search bar row — search + filter icon */
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: -22,
    marginBottom: 14,
  },
  searchWrap: {
    flex: 1,
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
  searchInput: { flex: 1, color: theme.textOnLight, fontSize: 15 },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterIconBtnOn: {
    backgroundColor: "#e8eef9",
    borderColor: theme.primaryDark,
  },
  /* Chip row — sort + filter inline */
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sortChipOn: {
    backgroundColor: theme.primaryDark,
    borderColor: theme.primaryDark,
  },
  sortChipText: { fontSize: 12, fontWeight: "600", color: theme.textMutedOnLight },
  sortChipTextOn: { color: "#fff" },
  chipDivider: { width: 1, height: 18, backgroundColor: "#e2e8f0" },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    maxWidth: 140,
  },
  filterChipOn: { borderColor: theme.primary, backgroundColor: "#e8eef9" },
  filterChipText: { fontSize: 12, fontWeight: "600", color: theme.textMutedOnLight },
  filterChipTextOn: { color: theme.primaryDark, fontWeight: "700" },
  /* Active ticket card */
  activeCard: {
    backgroundColor: "#d6e4f5",
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#b8cfe8",
  },
  activeCardServing: {
    backgroundColor: "#d4edda",
  },
  activeCardNext: {
    backgroundColor: "#FFF9E8",
  },
  activeTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  activeCardLabel: { color: "#1a1a1a", fontSize: 15, fontWeight: "800" },
  activeTicket: { fontSize: 22, fontWeight: "900", color: theme.primaryDark, marginTop: 4 },
  activeServiceBranch: { fontSize: 12, fontWeight: "600", color: theme.textMutedOnLight, marginTop: 4 },
  activeSlot: { fontSize: 12, fontWeight: "600", color: theme.textMutedOnLight, marginTop: 3 },
  activeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: "rgba(0,0,0,0.15)",
  },
  activeMetaCol: { flex: 1, alignItems: "center" },
  activeMetaDivider: { width: 1.5, alignSelf: "stretch", backgroundColor: "rgba(0,0,0,0.15)" },
  activeMetaLabel: { fontSize: 11, color: theme.textMutedOnLight, fontWeight: "600" },
  activeMetaValue: { fontSize: 15, fontWeight: "800", color: theme.primaryDark, marginTop: 4, textAlign: "center" },
  activeStatusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: "rgba(0,0,0,0.15)",
  },
  activeStatusTextLight: { flex: 1, fontSize: 13, fontWeight: "600", color: theme.textOnLight, lineHeight: 18 },
  /* Empty ticket card */
  emptyTicketCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f2f2f2",
    borderRadius: 14,
    padding: 16,
    marginBottom: 6,
  },
  emptyTicketIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#e2e2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTicketTitle: { fontSize: 15, fontWeight: "700", color: "#4a4a4a" },
  emptyTicketSub: { fontSize: 12, color: "#8a8a8a", marginTop: 2 },
  /* Recommendation — subtle */
  recommendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  recommendText: { fontSize: 12, color: theme.textMutedOnLight },
  /* Section */
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: theme.textOnLight },
  viewAll: { color: theme.primaryDark, fontWeight: "700", fontSize: 13 },
  /* Branch card — clean like reference */
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 12,
  },
  branchThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#e8edf5",
    alignItems: "center",
    justifyContent: "center",
  },
  branchThumbImg: { width: 52, height: 52, borderRadius: 14, backgroundColor: "#e8edf5" },
  branchInfo: { flex: 1, minWidth: 0 },
  branchTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  branchName: { fontSize: 15, fontWeight: "700", color: theme.textOnLight, flex: 1 },
  branchAddr: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 3 },
  branchMetaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  branchMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  branchMetaText: { fontSize: 12, color: theme.textMutedOnLight, fontWeight: "600" },
  crowdDot: { width: 7, height: 7, borderRadius: 4 },
  bookBtn: {
    marginLeft: "auto",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: theme.primaryDark,
  },
  bookBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
});
