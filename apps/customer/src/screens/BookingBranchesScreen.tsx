import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { FlatList, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
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
  const { branches, busy, loadBranches, userCoords } = useCustomer();

  const sorted = [...branches]
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

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <Text style={styles.title}>Branches</Text>
      <Text style={styles.sub}>Choose a branch · book a slot or walk-in ticket</Text>
      <PrimaryButton label="Refresh branches" variant="ghost" icon="refresh-outline" onPress={() => void loadBranches()} />
      <FlatList
        data={sorted}
        keyExtractor={(x) => x.b.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item: { b, dist } }) => (
          <View style={styles.card}>
            <View style={styles.thumb}>
              <Ionicons name="storefront-outline" size={26} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{b.name}</Text>
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
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 18 },
  title: { fontSize: 26, fontWeight: "800", color: theme.text },
  sub: { color: theme.textMuted, marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.bgCard,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    flexWrap: "wrap",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: theme.text },
  stateTag: { fontSize: 11, fontWeight: "700", color: theme.accent, marginTop: 4 },
  meta: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  addr: { fontSize: 12, color: theme.textMuted, marginTop: 4, lineHeight: 16 },
  openNow: { fontSize: 12, fontWeight: "700", color: theme.success, marginTop: 6 },
  near: { fontSize: 12, color: theme.accent, marginTop: 4, fontWeight: "600" },
});
