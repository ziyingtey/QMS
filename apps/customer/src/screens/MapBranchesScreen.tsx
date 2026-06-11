import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
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
import type { BranchDto } from "../api";
import { MALAYSIA_STATE_FILTERS } from "../constants/malaysiaStates";
import { useCustomer } from "../context/CustomerContext";
import { useMapsDistance } from "../hooks/useMapsDistance";
import type { RootStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { distanceMeters, formatDistance } from "../utils/geo";
import { getBranchOpenStatus } from "../utils/branchStatus";

function matchesStateFilter(branch: BranchDto, selected: string): boolean {
  if (selected === "All") return true;
  const st = (branch.state ?? "").trim();
  if (st.length > 0) return st.toLowerCase() === selected.toLowerCase();
  return (branch.address ?? "").toLowerCase().includes(selected.toLowerCase());
}

type Props = NativeStackScreenProps<RootStackParamList, "MapBranches">;

const NativeMaps = Platform.OS !== "web" ? require("react-native-maps") : null;

export function MapBranchesScreen({ navigation }: Props) {
  const MapView = NativeMaps?.default;
  const Marker = NativeMaps?.Marker;
  const mapRef = useRef<{ animateToRegion: (r: object) => void } | null>(null);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { branches, userCoords, requestLocation, loadBranches } = useCustomer();
  const { distances: mapsDistances } = useMapsDistance(userCoords, branches);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [filtersVisible, setFiltersVisible] = useState(false);

  useEffect(() => {
    void requestLocation();
    if (branches.length === 0) void loadBranches();
  }, [requestLocation, loadBranches, branches.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter(
      (b) => matchesStateFilter(b, stateFilter) && (!q || b.name.toLowerCase().includes(q) || (b.address ?? "").toLowerCase().includes(q)),
    );
  }, [branches, search, stateFilter]);

  const sortedForList = useMemo(() => {
    return [...filtered]
      .map((b) => ({
        b,
        dist:
          userCoords != null ? distanceMeters(userCoords.latitude, userCoords.longitude, b.latitude, b.longitude) : null,
      }))
      .sort((a, x) => {
        if (a.dist == null && x.dist == null) return a.b.name.localeCompare(x.b.name);
        if (a.dist == null) return 1;
        if (x.dist == null) return -1;
        return a.dist - x.dist;
      });
  }, [filtered, userCoords]);

  const initialRegion = useMemo(() => {
    if (userCoords) {
      return {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.09,
        longitudeDelta: 0.09,
      };
    }
    if (filtered.length === 0) {
      return { latitude: 3.139, longitude: 101.6869, latitudeDelta: 0.18, longitudeDelta: 0.18 };
    }
    const lat = filtered.reduce((s, b) => s + b.latitude, 0) / filtered.length;
    const lng = filtered.reduce((s, b) => s + b.longitude, 0) / filtered.length;
    return { latitude: lat, longitude: lng, latitudeDelta: 0.14, longitudeDelta: 0.14 };
  }, [userCoords, filtered]);

  useEffect(() => {
    if (!userCoords || !mapRef.current || !MapView) return;
    mapRef.current.animateToRegion({
      latitude: userCoords.latitude,
      longitude: userCoords.longitude,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    });
  }, [userCoords?.latitude, userCoords?.longitude, MapView]);

  const openMapsApp = (lat: number, lng: number, label: string) => {
    const q = encodeURIComponent(`${label}`);
    if (Platform.OS === "web") {
      void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
      return;
    }
    const url =
      Platform.OS === "ios"
        ? `maps://?q=${q}&ll=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
    void Linking.openURL(url);
  };

  const goBookBranch = (branchId: string) => {
    const b = branches.find((x) => x.id === branchId);
    if (!b) return;
    navigation.navigate("MainTabs", {
      screen: "Booking",
      params: { screen: "BookingServices", params: { branch: b } },
    });
  };

  const goBranchDetail = (branch: BranchDto) => {
    navigation.navigate("BranchDetail", { branch });
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Find a Branch</Text>
          <Pressable onPress={() => setFiltersVisible(!filtersVisible)} hitSlop={8}>
            <Ionicons name="options-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search branch name or address..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>

        {/* State filter chips */}
        {filtersVisible && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateScroll}>
            {MALAYSIA_STATE_FILTERS.map((s) => {
              const on = stateFilter === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStateFilter(s)}
                  style={[styles.stateChip, on && styles.stateChipOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.stateChipText, on && styles.stateChipTextOn]} numberOfLines={1}>
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Map */}
      {MapView && Marker ? (
        <MapView
          ref={mapRef as never}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={Platform.OS !== "web"}
          showsMyLocationButton={false}
        >
          {filtered.map((b) => (
            <Marker
              key={b.id}
              coordinate={{ latitude: b.latitude, longitude: b.longitude }}
              title={b.name}
              description={b.state ?? ""}
              onCalloutPress={() => goBranchDetail(b)}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={48} color="#cbd5e1" />
          <Text style={styles.mapPlaceholderText}>Map not available on web</Text>
        </View>
      )}

      {/* Locate Me FAB */}
      {MapView ? (
        <Pressable
          accessibilityLabel="Locate me"
          style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 200 }]}
          onPress={() => void requestLocation()}
        >
          <Ionicons name="locate" size={22} color="#fff" />
        </Pressable>
      ) : null}

      {/* Bottom Sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>
          Nearby {filtered.length > 0 ? `(${filtered.length})` : ""}
        </Text>
        <FlatList
          horizontal
          data={sortedForList}
          keyExtractor={(x) => x.b.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}
          renderItem={({ item: { b, dist } }) => {
            const branchOpen = getBranchOpenStatus(b) === "Open";
            const mapsInfo = mapsDistances.get(b.id);
            return (
              <Pressable style={styles.miniCard} onPress={() => goBranchDetail(b)}>
                <Text style={styles.miniTitle} numberOfLines={1}>{b.name}</Text>
                {b.state ? <Text style={styles.miniState}>{b.state}</Text> : null}
                {b.address ? (
                  <Text style={styles.miniAddr} numberOfLines={2}>{b.address}</Text>
                ) : null}
                <View style={styles.miniMeta}>
                  <Text style={[styles.miniOpen, { color: branchOpen ? "#16a34a" : "#dc2626" }]}>
                    {branchOpen ? "Open" : "Closed"}
                  </Text>
                  {mapsInfo ? (
                    <Text style={styles.miniDist}>{mapsInfo.distanceText} · {mapsInfo.durationText}</Text>
                  ) : dist != null ? (
                    <Text style={styles.miniDist}>{formatDistance(dist)}</Text>
                  ) : null}
                </View>
                <View style={styles.miniActions}>
                  <Pressable style={styles.miniActionBtn} onPress={() => goBookBranch(b.id)}>
                    <Text style={styles.miniActionText}>Book</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.miniActionBtn, styles.miniActionBtnOutline]}
                    onPress={() => openMapsApp(b.latitude, b.longitude, b.name)}
                  >
                    <Text style={[styles.miniActionText, { color: theme.primaryDark }]}>Maps</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },

  // Header
  header: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14 },
  stateScroll: { flexDirection: "row", gap: 8, paddingTop: 10, paddingBottom: 4 },
  stateChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  stateChipOn: { backgroundColor: "#fff" },
  stateChipText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  stateChipTextOn: { color: theme.headerNavy, fontWeight: "700" },

  // Map
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mapPlaceholderText: { fontSize: 14, color: "#94a3b8" },

  // FAB
  fab: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  // Bottom Sheet
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.textOnLight,
    marginBottom: 12,
  },

  // Mini Cards
  miniCard: {
    width: 200,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  miniTitle: { fontSize: 15, fontWeight: "700", color: theme.textOnLight },
  miniState: { fontSize: 12, fontWeight: "600", color: theme.primaryDark, marginTop: 3 },
  miniAddr: { fontSize: 11, color: theme.textMutedOnLight, marginTop: 4, lineHeight: 15 },
  miniMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  miniOpen: { fontSize: 12, fontWeight: "700" },
  miniDist: { fontSize: 12, color: theme.textMutedOnLight },
  miniActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  miniActionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: theme.primaryDark,
    alignItems: "center",
  },
  miniActionBtnOutline: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: theme.primaryDark,
  },
  miniActionText: { fontSize: 12, fontWeight: "700", color: "#fff" },
});
