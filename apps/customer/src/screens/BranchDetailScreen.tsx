import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../context/CustomerContext";
import type { RootStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { distanceMeters, formatDistance } from "../utils/geo";
import { getBranchOpenStatus, getTodayHoursLabel } from "../utils/branchStatus";

type Props = NativeStackScreenProps<RootStackParamList, "BranchDetail">;

export function BranchDetailScreen({ navigation, route }: Props) {
  const { branch } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { profile, toggleFavoriteBranch, userCoords, togglingFavoriteBranchId } = useCustomer();
  const isFavorite = (profile?.favoriteBranchIds ?? []).includes(branch.id);
  const favoriteBusy = togglingFavoriteBranchId === branch.id;
  const distM =
    userCoords != null ? distanceMeters(userCoords.latitude, userCoords.longitude, branch.latitude, branch.longitude) : null;
  const isOpen = getBranchOpenStatus(branch) === "Open";
  const todayHours = getTodayHoursLabel(branch) ?? branch.operatingHours ?? "—";

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => void toggleFavoriteBranch(branch.id)}
            disabled={favoriteBusy}
            hitSlop={8}
          >
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={22} color={isFavorite ? "#fda4af" : "rgba(255,255,255,0.7)"} />
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>{branch.name}</Text>
        {branch.state ? <Text style={styles.headerState}>{branch.state}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          {/* Open/Closed + Hours */}
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isOpen ? "#22c55e" : "#ef4444" }]} />
            <Text style={[styles.statusLabel, { color: isOpen ? "#16a34a" : "#dc2626" }]}>
              {isOpen ? "Open" : "Closed"}
            </Text>
            <Text style={styles.statusDivider}>·</Text>
            <Text style={styles.hoursText}>{todayHours}</Text>
          </View>

          {/* Address */}
          {branch.address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={theme.primaryDark} />
              <Text style={styles.infoText}>{branch.address}</Text>
            </View>
          ) : null}

          {/* Distance */}
          {distM != null ? (
            <View style={styles.infoRow}>
              <Ionicons name="navigate-outline" size={16} color={theme.primaryDark} />
              <Text style={styles.infoText}>
                <Text style={styles.infoStrong}>{formatDistance(distM)}</Text> from you
              </Text>
            </View>
          ) : null}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              navigation.navigate("MainTabs", {
                screen: "Booking",
                params: { screen: "BookingServices", params: { branch } },
              });
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#eef4ff" }]}>
              <Ionicons name="calendar-outline" size={20} color={theme.primaryDark} />
            </View>
            <Text style={styles.actionLabel}>Book</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => void toggleFavoriteBranch(branch.id)}
            disabled={favoriteBusy}
          >
            <View style={[styles.actionIcon, { backgroundColor: isFavorite ? "#fef2f2" : "#f0fdf4" }]}>
              <Ionicons
                name={isFavorite ? "heart-dislike-outline" : "heart-outline"}
                size={20}
                color={isFavorite ? "#dc2626" : "#16a34a"}
              />
            </View>
            <Text style={styles.actionLabel}>{isFavorite ? "Unfavorite" : "Favorite"}</Text>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={() => navigation.goBack()}>
            <View style={[styles.actionIcon, { backgroundColor: "#fefce8" }]}>
              <Ionicons name="share-outline" size={20} color="#a16207" />
            </View>
            <Text style={styles.actionLabel}>Share</Text>
          </Pressable>
        </View>

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          {branch.services.map((s) => (
            <View key={s.id} style={styles.serviceRow}>
              <View style={styles.serviceIcon}>
                <Ionicons name="briefcase-outline" size={16} color={theme.primaryDark} />
              </View>
              <Text style={styles.serviceText}>{s.name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
            </View>
          ))}
        </View>

        {/* Book Button */}
        <View style={styles.bookBtnWrap}>
          <Pressable
            style={styles.bookBtn}
            onPress={() => {
              navigation.navigate("MainTabs", {
                screen: "Booking",
                params: { screen: "BookingServices", params: { branch } },
              });
            }}
          >
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={styles.bookBtnText}>Book a visit</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.screenBg },
  header: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#fff" },
  headerState: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 3 },

  // Info card
  infoCard: {
    backgroundColor: "#fff",
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: "700" },
  statusDivider: { color: "#cbd5e1", fontSize: 13 },
  hoursText: { fontSize: 13, color: theme.textMutedOnLight, fontWeight: "600" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 },
  infoText: { flex: 1, fontSize: 13, color: theme.textMutedOnLight, lineHeight: 18 },
  infoStrong: { fontWeight: "700", color: theme.primaryDark },

  // Quick actions
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginHorizontal: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  actionBtn: { alignItems: "center", gap: 6 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 12, fontWeight: "600", color: theme.textMutedOnLight },

  // Services section
  section: {
    marginHorizontal: 18,
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.textOnLight, marginBottom: 10 },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  serviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#edf2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceText: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.textOnLight },

  // Book button
  bookBtnWrap: { marginHorizontal: 18, marginTop: 20 },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.primaryDark,
    paddingVertical: 14,
    borderRadius: 14,
  },
  bookBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
