import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../context/CustomerContext";
import type { RootStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { distanceMeters, formatDistance, fetchMapsDistance, type MapsDistanceResult } from "../utils/geo";
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
  const [mapsInfo, setMapsInfo] = useState<MapsDistanceResult | null>(null);
  const isOpen = getBranchOpenStatus(branch) === "Open";
  const todayHours = getTodayHoursLabel(branch) ?? branch.operatingHours ?? "—";
  const [servicesExpanded, setServicesExpanded] = useState(false);

  useEffect(() => {
    if (!userCoords) return;
    fetchMapsDistance(userCoords.latitude, userCoords.longitude, branch.latitude, branch.longitude)
      .then(setMapsInfo);
  }, [userCoords?.latitude, userCoords?.longitude, branch.latitude, branch.longitude]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header with building icon */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerTop}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.headerBtn}
            onPress={() => void toggleFavoriteBranch(branch.id)}
            disabled={favoriteBusy}
            hitSlop={8}
          >
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Building icon */}
        <View style={styles.buildingIconWrap}>
          <Ionicons name="business" size={48} color="rgba(255,255,255,0.85)" />
        </View>

        <Text style={styles.headerTitle}>{branch.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Info Section */}
        <View style={styles.infoCard}>
          {/* State + Open/Closed chips */}
          <View style={styles.chipsRow}>
            {branch.state ? (
              <View style={styles.stateBadge}>
                <Text style={styles.stateBadgeText}>{branch.state}</Text>
              </View>
            ) : null}
            <View style={[styles.openBadge, { backgroundColor: isOpen ? "#dcfce7" : "#fee2e2" }]}>
              <Text style={[styles.openBadgeText, { color: isOpen ? "#16a34a" : "#dc2626" }]}>
                {isOpen ? "Open" : "Closed"}
              </Text>
            </View>
          </View>

          {/* Distance — prefer Maps API (driving), fallback to Haversine (straight-line) */}
          {(mapsInfo || distM != null) ? (
            <View style={styles.infoRow}>
              <Ionicons name={mapsInfo ? "car-outline" : "navigate-circle-outline"} size={16} color={theme.textMutedOnLight} />
              <Text style={styles.infoText}>
                {mapsInfo ? (
                  <>
                    <Text style={styles.infoStrong}>{mapsInfo.distanceText}</Text>
                    {" · "}
                    <Text style={styles.infoStrong}>{mapsInfo.durationText}</Text>
                    {" drive from you"}
                  </>
                ) : (
                  <>
                    <Text style={styles.infoStrong}>{formatDistance(distM!)}</Text> from you
                  </>
                )}
              </Text>
            </View>
          ) : null}

          {/* Address */}
          {branch.address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={theme.textMutedOnLight} />
              <Text style={styles.infoText}>{branch.address}</Text>
            </View>
          ) : null}

          {/* Hours */}
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={theme.textMutedOnLight} />
            <Text style={styles.infoText}>{todayHours}</Text>
          </View>
        </View>

        {/* Services - collapsible */}
        <View style={styles.servicesSection}>
          <Pressable
            style={styles.servicesTitleRow}
            onPress={() => setServicesExpanded(!servicesExpanded)}
          >
            <Text style={styles.servicesTitle}>Services at this branch</Text>
            <Ionicons
              name={servicesExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.textMutedOnLight}
            />
          </Pressable>

          {servicesExpanded && (
            <View style={styles.chipsWrap}>
              {branch.services.map((s) => (
                <View key={s.id} style={styles.chip}>
                  <Text style={styles.chipText}>{s.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Bottom Buttons */}
        <View style={styles.buttonsWrap}>
          <Pressable
            style={[styles.favBtn, favoriteBusy && { opacity: 0.6 }]}
            onPress={() => void toggleFavoriteBranch(branch.id)}
            disabled={favoriteBusy}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color="#fff"
            />
            <Text style={styles.favBtnText}>
              {isFavorite ? "Remove from favorites" : "Add to favorites"}
            </Text>
          </Pressable>

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
            <Text style={styles.bookBtnText}>Book a turn here</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.screenBg },

  // Header
  header: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 24,
    alignItems: "center",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  buildingIconWrap: {
    marginBottom: 14,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#fff", alignSelf: "flex-start" },

  // Info card
  infoCard: {
    backgroundColor: "#fff",
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 18,
    padding: 18,
    paddingTop: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  stateBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  stateBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.headerNavy,
  },
  openBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  openBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 13, color: theme.textMutedOnLight, lineHeight: 18 },
  infoStrong: { fontWeight: "700", color: theme.textOnLight },

  // Services
  servicesSection: {
    marginHorizontal: 18,
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  servicesTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  servicesTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.textOnLight,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.textOnLight,
  },

  // Buttons
  buttonsWrap: {
    marginHorizontal: 18,
    marginTop: 20,
    gap: 12,
  },
  favBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.headerNavy,
    paddingVertical: 15,
    borderRadius: 14,
  },
  favBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22c55e",
    paddingVertical: 15,
    borderRadius: 14,
  },
  bookBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
