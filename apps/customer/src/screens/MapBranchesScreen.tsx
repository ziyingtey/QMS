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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BranchDto } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { MALAYSIA_STATE_FILTERS } from "../constants/malaysiaStates";
import { useCustomer } from "../context/CustomerContext";
import type { RootStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { distanceMeters, formatDistance } from "../utils/geo";

const OFFICIAL_PB_LOCATOR = "https://www.pbebank.com/en/branch-locator/";

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
  const { branches, userCoords, requestLocation, loadBranches } = useCustomer();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [layoutMode, setLayoutMode] = useState<"map" | "list">("map");

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

  const topPad = Math.max(insets.top, 12);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for an Office…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={styles.filterBlock}>
        <View style={styles.typeRow}>
          <Text style={styles.typeLabel}>Type</Text>
          <View style={styles.typeChipOn}>
            <Text style={styles.typeChipOnText}>Branches (queue)</Text>
          </View>
        </View>
        <Text style={styles.stateLabel}>State</Text>
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
        <Text style={styles.disclosure}>
          Pins are your QMS branch list (database), not a live copy of the bank's public site. Import or enter real
          branches to match production.
        </Text>
        <Pressable onPress={() => void Linking.openURL(OFFICIAL_PB_LOCATOR)} style={styles.officialRow}>
          <Ionicons name="open-outline" size={16} color={theme.accent} />
          <Text style={styles.officialLink}>Open Public Bank's full branch directory (official)</Text>
        </Pressable>
      </View>

      {MapView && Marker && layoutMode === "map" ? (
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
              description={[b.state, "Open now · tap card below to book"].filter(Boolean).join(" · ")}
              onCalloutPress={() => goBookBranch(b.id)}
            />
          ))}
        </MapView>
      ) : (
        <FlatList
          data={sortedForList}
          keyExtractor={(x) => x.b.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item: { b, dist } }) => (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>{b.name}</Text>
              {b.state ? <Text style={styles.listState}>{b.state}</Text> : null}
              {b.address ? <Text style={styles.listAddr}>{b.address}</Text> : null}
              <Text style={styles.listMeta}>
                {dist != null ? formatDistance(dist) + " · " : ""}
                {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)}
              </Text>
              <View style={styles.listActions}>
                <PrimaryButton label="Open in Maps" compact variant="ghost" onPress={() => openMapsApp(b.latitude, b.longitude, b.name)} />
                <PrimaryButton label="Book" compact onPress={() => goBookBranch(b.id)} />
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No branches match your search.</Text>}
        />
      )}

      {MapView && layoutMode === "map" ? (
        <Pressable
          accessibilityLabel="Locate me"
          style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 8 }]}
          onPress={() => void requestLocation()}
        >
          <Ionicons name="locate" size={26} color="#fff" />
        </Pressable>
      ) : null}

      {MapView ? (
        <Pressable
          accessibilityLabel={layoutMode === "map" ? "List view" : "Map view"}
          style={[styles.fabToggle, { bottom: Math.max(insets.bottom, 16) + (MapView && layoutMode === "map" ? 72 : 8) }]}
          onPress={() => setLayoutMode((m) => (m === "map" ? "list" : "map"))}
        >
          <Ionicons name={layoutMode === "map" ? "list-outline" : "map-outline"} size={24} color="#fff" />
        </Pressable>
      ) : null}

      {MapView && layoutMode === "map" ? (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.sheetTitle}>Nearby</Text>
          <FlatList
            horizontal
            data={sortedForList}
            keyExtractor={(x) => x.b.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item: { b, dist } }) => (
              <Pressable style={styles.miniCard} onPress={() => goBookBranch(b.id)}>
                <Text style={styles.miniTitle} numberOfLines={2}>
                  {b.name}
                </Text>
                {b.state ? <Text style={styles.miniState}>{b.state}</Text> : null}
                {b.address ? (
                  <Text style={styles.miniAddr} numberOfLines={2}>
                    {b.address}
                  </Text>
                ) : null}
                <Text style={styles.openChip}>Open Now</Text>
                <Text style={styles.miniMeta}>{dist != null ? formatDistance(dist) : "—"}</Text>
                <Text style={styles.miniLink}>Book · Maps</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.bgCard,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.bgCard,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchInput: { flex: 1, color: theme.text, fontSize: 16 },
  filterBlock: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 4,
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 8,
  },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "700", width: 44 },
  typeChipOn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typeChipOnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stateLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  stateScroll: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  stateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stateChipOn: { backgroundColor: theme.chip, borderColor: theme.primary },
  stateChipText: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
  stateChipTextOn: { color: theme.text },
  disclosure: { color: theme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  officialRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  officialLink: { color: theme.accent, fontSize: 12, fontWeight: "700", flex: 1 },
  map: { flex: 1 },
  fab: {
    position: "absolute",
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  fabToggle: {
    position: "absolute",
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.navBar,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  sheetTitle: { color: theme.textMuted, fontWeight: "700", marginBottom: 10, fontSize: 13 },
  miniCard: {
    width: 168,
    backgroundColor: theme.bgCard,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  miniTitle: { color: theme.text, fontWeight: "700", fontSize: 14 },
  miniState: { color: theme.accent, fontSize: 11, fontWeight: "600", marginTop: 4 },
  miniAddr: { color: theme.textMuted, fontSize: 10, marginTop: 4, lineHeight: 14 },
  openChip: { color: theme.success, fontSize: 11, fontWeight: "700", marginTop: 6 },
  miniMeta: { color: theme.textMuted, fontSize: 12, marginTop: 6 },
  miniLink: { color: theme.accent, fontSize: 12, fontWeight: "700", marginTop: 8 },
  listCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    backgroundColor: theme.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  listTitle: { color: theme.text, fontWeight: "800", fontSize: 16 },
  listState: { color: theme.accent, fontSize: 12, fontWeight: "700", marginTop: 4 },
  listAddr: { color: theme.textMuted, fontSize: 12, marginTop: 6, lineHeight: 16 },
  listMeta: { color: theme.textMuted, fontSize: 13, marginTop: 6 },
  listActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  empty: { color: theme.textMuted, textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
});
