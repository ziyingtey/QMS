import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { FlatList, Image, Platform, RefreshControl, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BookingStackParamList } from "../navigation/navigationRef";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";
import { distanceMeters, formatDistance } from "../utils/geo";

type Props = NativeStackScreenProps<BookingStackParamList, "BookingBranches">;

export function BookingBranchesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { branches, busy, loadBranches, userCoords, profile } = useCustomer();
  const [listRefreshing, setListRefreshing] = useState(false);
  const favIds = profile?.favoriteBranchIds ?? [];

  const onListRefresh = async () => {
    setListRefreshing(true);
    try {
      await loadBranches();
    } finally {
      setListRefreshing(false);
    }
  };

  const sorted = [...branches]
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
        <Text style={styles.sub}>Choose a branch · book a slot or walk-in ticket</Text>
        <PrimaryButton label="Refresh branches" variant="ghost" icon="refresh-outline" onPress={() => void loadBranches()} />
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
        renderItem={({ item: { b, dist } }) => (
          <View style={styles.card}>
            {b.imageUrl ? (
              <Image source={{ uri: b.imageUrl }} style={styles.thumbImg} />
            ) : (
              <View style={styles.thumb}>
                <Ionicons name="storefront-outline" size={26} color={theme.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Text style={styles.cardTitle}>{b.name}</Text>
                {favIds.includes(b.id) ? (
                  <View style={styles.pref}>
                    <Text style={styles.prefText}>Favorite</Text>
                  </View>
                ) : null}
              </View>
              {b.state ? <Text style={styles.stateTag}>{b.state}</Text> : null}
              {b.address ? (
                <Text style={styles.addr} numberOfLines={2}>
                  {b.address}
                </Text>
              ) : (
                <Text style={styles.meta}>Banking & queue services</Text>
              )}
              <Text style={styles.openNow}>Open Now</Text>
              <Text style={styles.near}>
                {dist != null ? `Near You: ${formatDistance(dist)}` : "Near You: enable location on Home"}
              </Text>
            </View>
            <PrimaryButton label="Book a turn" compact onPress={() => navigation.navigate("BookingServices", { branch: b })} />
          </View>
        )}
        ListEmptyComponent={
          busy ? (
            <Text style={styles.meta}>Loading…</Text>
          ) : (
            <Text style={styles.meta}>No branches returned from API.</Text>
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
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#fff" },
  sub: { color: "rgba(255,255,255,0.85)", marginBottom: 10, marginTop: 6 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.borderLight,
    flexWrap: "wrap",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#e8eef9",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#e8eef9" },
  cardTitle: { fontSize: 17, fontWeight: "700", color: theme.textOnLight },
  stateTag: { fontSize: 11, fontWeight: "700", color: theme.primary, marginTop: 4 },
  meta: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 4 },
  addr: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 4, lineHeight: 16 },
  openNow: { fontSize: 12, fontWeight: "700", color: theme.success, marginTop: 6 },
  near: { fontSize: 12, color: theme.primaryDark, marginTop: 4, fontWeight: "600" },
  pref: {
    backgroundColor: "rgba(34,197,94,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  prefText: { fontSize: 10, fontWeight: "900", color: theme.success },
});
