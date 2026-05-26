import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE } from "../config";
import { useCustomer } from "../context/CustomerContext";
import type { MainTabParamList } from "../navigation/navigationRef";
import { navigationRef } from "../navigation/navigationRef";
import { theme } from "../theme";

function initialsFromProfile(name: string | undefined, email: string | null): string {
  const n = (name ?? "").trim();
  if (n.length > 0) {
    const parts = n.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "";
    const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
    return (a + b).toUpperCase().slice(0, 2) || "?";
  }
  const e = (email ?? "").trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

type MenuProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  chevron?: boolean;
};

function MenuRow({ icon, title, subtitle, onPress, danger, chevron = true }: MenuProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      accessibilityRole="button"
    >
      <View style={[styles.menuIconWrap, danger && styles.menuIconWrapDanger]}>
        <Ionicons name={icon} size={22} color={danger ? theme.danger : theme.primaryDark} />
      </View>
      <View style={styles.menuTextCol}>
        <Text style={[styles.menuTitle, danger && styles.menuTitleDanger]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {chevron ? <Ionicons name="chevron-forward" size={20} color={theme.textMutedOnLight} /> : null}
    </Pressable>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { userEmail, onLogout, requestLocation, profile, branches, loadBranches, refreshProfile, locationBusy, bookings } =
    useCustomer();
  const favoriteIds = profile?.favoriteBranchIds ?? [];
  const [refreshing, setRefreshing] = useState(false);

  const displayName = useMemo(() => {
    const n = profile?.name?.trim();
    if (n) return n;
    return userEmail?.split("@")[0] ?? "Customer";
  }, [profile?.name, userEmail]);

  const initials = useMemo(() => initialsFromProfile(profile?.name, userEmail), [profile?.name, userEmail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadBranches(), refreshProfile()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadBranches, refreshProfile]);

  const openBranchDetail = (branchId: string) => {
    const b = branches.find((x) => x.id === branchId);
    if (!b) {
      Alert.alert("Branch", "Branch list is still loading or this favorite is no longer available.");
      return;
    }
    if (navigationRef.isReady()) navigationRef.navigate("BranchDetail", { branch: b });
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You will need to sign in again to book or view your queue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void onLogout() },
    ]);
  };

  const upcomingBookings = bookings.filter((b) => b.status !== "Cancelled" && b.status !== "Completed" && b.status !== "NoShow").length;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#ffffff"
            colors={["#ffffff"]}
            progressBackgroundColor={theme.headerNavy}
          />
        }
      >
        <View style={[styles.hero, { paddingTop: topPad }]}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.heroName}>{displayName}</Text>
          <View style={styles.memberPill}>
            <Ionicons name="shield-checkmark" size={14} color="rgba(255,255,255,0.95)" />
            <Text style={styles.memberPillText}>Customer account</Text>
          </View>
          <View style={styles.idCard}>
            <View style={styles.idRow}>
              <Ionicons name="mail-outline" size={18} color={theme.textMutedOnLight} />
              <Text style={styles.idValue} numberOfLines={1}>
                {profile?.email?.trim() || userEmail || "—"}
              </Text>
            </View>
            <View style={styles.idDivider} />
            <View style={styles.idRow}>
              <Ionicons name="call-outline" size={18} color={theme.textMutedOnLight} />
              <Text style={styles.idValue}>{profile?.phone?.trim() || "No phone on file"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <SectionTitle>Shortcuts</SectionTitle>
          <View style={styles.card}>
            <MenuRow
              icon="ticket-outline"
              title="My queue & bookings"
              subtitle={upcomingBookings > 0 ? `${upcomingBookings} active booking(s)` : "View tickets and live status"}
              onPress={() => tabNav.navigate("Queue")}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="calendar-outline"
              title="Book a visit"
              subtitle="Choose branch, service, and time"
              onPress={() => tabNav.navigate("Booking", { screen: "BookingBranches" })}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="map-outline"
              title="Map & branch locator"
              subtitle="Browse locations on a map"
              onPress={() => {
                if (navigationRef.isReady()) navigationRef.navigate("MapBranches");
              }}
            />
          </View>

          <SectionTitle>Saved branches</SectionTitle>
          <View style={styles.card}>
            {favoriteIds.length === 0 ? (
              <Text style={styles.emptyFav}>
                Heart a branch from Home or branch details — your favorites will show here.
              </Text>
            ) : (
              favoriteIds.map((id, i) => {
                const n = branches.find((b) => b.id === id)?.name ?? "Branch";
                return (
                  <View key={id}>
                    {i > 0 ? <View style={styles.menuDivider} /> : null}
                    <MenuRow
                      icon="heart"
                      title={n}
                      subtitle="Open branch details"
                      onPress={() => openBranchDetail(id)}
                      chevron
                    />
                  </View>
                );
              })
            )}
          </View>

          <SectionTitle>Account & device</SectionTitle>
          <View style={styles.card}>
            <MenuRow
              icon="location-outline"
              title="Refresh device location"
              subtitle={locationBusy ? "Getting GPS…" : "Used for branch distance sorting on Home"}
              onPress={() => void requestLocation()}
              chevron={false}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="notifications-outline"
              title="Notifications"
              subtitle="Reminders can be enabled in a future update"
              onPress={() => Alert.alert("Notifications", "Push reminders for your ticket and booking times can be wired in a later release.")}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="help-circle-outline"
              title="Help & support"
              subtitle="How booking, queue, and check-in work"
              onPress={() =>
                Alert.alert(
                  "Help",
                  "• Home: browse branches, book, and see your active ticket.\n• Booking: pick a branch, service, then a time slot.\n• Queue: live status for your tickets; pull down to refresh.\n• Tap I've arrived on a booking when you reach the branch (no GPS required).",
                )
              }
            />
          </View>

          <SectionTitle>About</SectionTitle>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>App</Text>
              <Text style={styles.aboutVal}>IH-QMS Customer</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Connected to</Text>
              <Text style={styles.aboutMono} numberOfLines={2} selectable>
                {API_BASE}
              </Text>
            </View>
            {__DEV__ ? (
              <>
                <View style={styles.aboutDivider} />
                <Text style={styles.devNote}>
                  Dev: set EXPO_PUBLIC_API_URL in apps/customer/.env. Simulators may use a fixed GPS — use a real device for
                  accurate distances.
                </Text>
              </>
            ) : null}
          </View>

          <Pressable style={styles.signOutBtn} onPress={confirmSignOut} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={22} color={theme.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Text style={styles.footerLegal}>Use only on your own device. Do not share your sign-in.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Match Home: overscroll / refresh strip uses header navy */
  screen: { flex: 1, backgroundColor: theme.headerNavy },
  scrollView: { flex: 1, backgroundColor: theme.headerNavy },
  scrollContent: { flexGrow: 1, paddingBottom: 120, backgroundColor: theme.screenBg },
  hero: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 22,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: "center",
  },
  avatarRing: {
    padding: 3,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    marginBottom: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  heroName: { fontSize: 22, fontWeight: "900", color: "#fff", textAlign: "center" },
  memberPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  memberPillText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.95)" },
  idCard: {
    alignSelf: "stretch",
    marginTop: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  idRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  idDivider: { height: 1, backgroundColor: theme.borderLight, marginVertical: 12 },
  idValue: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.textOnLight, minWidth: 0 },
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 20,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.textMutedOnLight,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.borderLight,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  menuRowPressed: { backgroundColor: "#f8fafc" },
  menuIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#e8eef9",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapDanger: { backgroundColor: "rgba(239,68,68,0.12)" },
  menuTextCol: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 16, fontWeight: "800", color: theme.textOnLight },
  menuTitleDanger: { color: theme.danger },
  menuSubtitle: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 3, lineHeight: 16 },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.borderLight, marginLeft: 70 },
  emptyFav: {
    padding: 18,
    fontSize: 14,
    color: theme.textMutedOnLight,
    lineHeight: 20,
    fontWeight: "500",
  },
  aboutRow: { paddingHorizontal: 16, paddingVertical: 12 },
  aboutLabel: { fontSize: 12, fontWeight: "700", color: theme.textMutedOnLight, marginBottom: 4 },
  aboutVal: { fontSize: 15, fontWeight: "700", color: theme.textOnLight },
  aboutMono: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.primaryDark,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  aboutDivider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.borderLight },
  devNote: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
    fontSize: 11,
    color: theme.textMutedOnLight,
    lineHeight: 16,
  },
  signOutBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  signOutText: { fontSize: 16, fontWeight: "800", color: theme.danger },
  footerLegal: {
    textAlign: "center",
    fontSize: 11,
    color: theme.textMutedOnLight,
    marginTop: 16,
    paddingHorizontal: 12,
    lineHeight: 16,
  },
});
