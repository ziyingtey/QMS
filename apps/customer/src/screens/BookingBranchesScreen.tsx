import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Image, Linking, Platform, Pressable, RefreshControl, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navigationRef, type BookingStackParamList } from "../navigation/navigationRef";
import { useCustomer } from "../context/CustomerContext";
import { useMapsDistance } from "../hooks/useMapsDistance";
import { theme } from "../theme";
import { getBranchOpenStatus, getTodayHoursLabel } from "../utils/branchStatus";
import { distanceMeters, formatDistance } from "../utils/geo";

type Props = NativeStackScreenProps<BookingStackParamList, "BookingBranches">;

export function BookingBranchesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { branches, busy, loadBranches, userCoords, profile } = useCustomer();
  const { distances: mapsDistances } = useMapsDistance(userCoords, branches);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const favIds = profile?.favoriteBranchIds ?? [];

  // Auto-refresh when screen gains focus + poll every 30s while visible
  useFocusEffect(
    useCallback(() => {
      void loadBranches();
      const interval = setInterval(() => void loadBranches(), 30_000);
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void loadBranches();
      });
      return () => {
        clearInterval(interval);
        sub.remove();
      };
    }, [loadBranches]),
  );

  const onListRefresh = async () => {
    setListRefreshing(true);
    try {
      await loadBranches();
    } finally {
      setListRefreshing(false);
    }
  };

  const filtered = branches.filter((b) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return b.name.toLowerCase().includes(q) || (b.address ?? "").toLowerCase().includes(q);
  });

  const sorted = [...filtered]
    .map((b) => ({
      b,
      dist:
        userCoords != null ? distanceMeters(userCoords.latitude, userCoords.longitude, b.latitude, b.longitude) : null,
    }))
    .sort((a, x) => {
      const pa = favIds.includes(a.b.id);
      const pb = favIds.includes(x.b.id);
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      if (a.dist == null && x.dist == null) return a.b.name.localeCompare(x.b.name);
      if (a.dist == null) return 1;
      if (x.dist == null) return -1;
      return a.dist - x.dist;
    });

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <Text style={styles.title}>Branches</Text>
        <Text style={styles.sub}>Choose a branch · book a slot</Text>
      </View>
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
          <Pressable
            accessibilityLabel="Locate on map"
            onPress={() => { if (navigationRef.isReady()) navigationRef.navigate("MapBranches"); }}
            hitSlop={8}
          >
            <Ionicons name="location-outline" size={18} color={theme.primaryDark} />
          </Pressable>
        </View>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(x) => x.b.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={listRefreshing}
            onRefresh={() => void onListRefresh()}
            tintColor={theme.primary}
            colors={[theme.primary]}
            progressBackgroundColor="#ffffff"
          />
        }
        renderItem={({ item: { b, dist } }) => {
          const mapsInfo = mapsDistances.get(b.id);
          return (
          <Pressable style={styles.card} onPress={() => { if (navigationRef.isReady()) navigationRef.navigate("BranchDetail", { branch: b }); }}>
            <View style={styles.cardTop}>
              {/* Left icon */}
              {b.imageUrl ? (
                <Image source={{ uri: b.imageUrl }} style={styles.thumbImg} />
              ) : (
                <View style={styles.thumb}>
                  <Ionicons name="location-outline" size={24} color={theme.primaryDark} />
                </View>
              )}
              {/* Content */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{b.name}</Text>
                  {b.state ? (
                    <View style={styles.stateChip}>
                      <Text style={styles.stateChipText}>{b.state}</Text>
                    </View>
                  ) : null}
                </View>
                {b.address ? (
                  <Text style={styles.addr} numberOfLines={1}>{b.address}</Text>
                ) : null}
                <View style={styles.metaRow}>
                  <Ionicons name="car-outline" size={13} color="#4a90d9" />
                  <Text style={styles.metaText}>
                    {mapsInfo ? mapsInfo.distanceText : dist != null ? formatDistance(dist) : "—"}
                  </Text>
                  {mapsInfo ? (
                    <>
                      <Ionicons name="time-outline" size={13} color="#4a90d9" />
                      <Text style={styles.metaText}>{mapsInfo.durationText}</Text>
                    </>
                  ) : null}
                  <Ionicons name="time-outline" size={13} color="#4a90d9" />
                  <Text style={styles.metaText}>{getTodayHoursLabel(b) ?? "—"}</Text>
                  <View style={[styles.openChip, getBranchOpenStatus(b) === "Closed" && styles.closedChip]}>
                    <Text style={[styles.openChipText, getBranchOpenStatus(b) === "Closed" && styles.closedChipText]}>
                      {getBranchOpenStatus(b)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            {/* Bottom row — Directions + Book */}
            <View style={styles.cardBottom}>
              <Pressable
                style={styles.detailsBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  const url = Platform.OS === "ios"
                    ? `maps://?q=${encodeURIComponent(b.name)}&ll=${b.latitude},${b.longitude}`
                    : `geo:${b.latitude},${b.longitude}?q=${b.latitude},${b.longitude}(${encodeURIComponent(b.name)})`;
                  void Linking.openURL(url);
                }}
              >
                <Ionicons name="navigate-outline" size={16} color={theme.primaryDark} />
                <Text style={styles.detailsBtnText}>Directions</Text>
              </Pressable>
              <Pressable
                style={styles.bookBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  navigation.navigate("BookingServices", { branch: b });
                }}
              >
                <Ionicons name="calendar-outline" size={14} color="#fff" />
                <Text style={styles.bookBtnText}>Book a Slot</Text>
              </Pressable>
            </View>
          </Pressable>
          );
        }}
        ListEmptyComponent={
          busy ? (
            <Text style={styles.emptyText}>Loading…</Text>
          ) : (
            <Text style={styles.emptyText}>No branches returned from API.</Text>
          )
        }
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
  title: { fontSize: 24, fontWeight: "800", color: "#fff" },
  sub: { color: "rgba(255,255,255,0.75)", marginTop: 4, fontSize: 13 },
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
  searchInput: { flex: 1, color: theme.textOnLight, fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardBottom: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9",
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#edf2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#edf2f7" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.textOnLight, flexShrink: 1 },
  addr: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, flexWrap: "wrap" },
  metaText: { fontSize: 12, color: theme.textMutedOnLight, fontWeight: "600" },
  openChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.12)",
    marginLeft: 4,
  },
  openChipText: { fontSize: 11, fontWeight: "700", color: theme.success },
  closedChip: { backgroundColor: "rgba(239,68,68,0.1)" },
  closedChipText: { color: "#e53e3e" },
  stateChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#edf2f7",
  },
  stateChipText: { fontSize: 10, fontWeight: "700", color: theme.primaryDark },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  detailsBtnText: { fontSize: 13, fontWeight: "700", color: theme.primaryDark },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.primaryDark,
  },
  bookBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  emptyText: { fontSize: 13, color: theme.textMutedOnLight, textAlign: "center", marginTop: 24 },
});
