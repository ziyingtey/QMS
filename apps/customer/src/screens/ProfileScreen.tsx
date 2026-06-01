import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
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

function MenuRow({ icon, title, subtitle, onPress, danger, chevron = true, iconBg, iconColor }: MenuProps & { iconBg?: string; iconColor?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      accessibilityRole="button"
    >
      <View style={[styles.menuIconWrap, danger && styles.menuIconWrapDanger, iconBg ? { backgroundColor: iconBg } : null]}>
        <Ionicons name={icon} size={20} color={danger ? theme.danger : (iconColor ?? theme.primaryDark)} />
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
      {chevron ? <Ionicons name="chevron-forward" size={18} color="#cbd5e1" /> : null}
    </Pressable>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { userEmail, onLogout, requestLocation, profile, branches, loadBranches, refreshProfile, locationBusy, bookings, updateProfile } =
    useCustomer();
  const favoriteIds = profile?.favoriteBranchIds ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openEdit = () => {
    setEditName(profile?.name ?? "");
    setEditPhone(profile?.phone ?? "");
    setEditVisible(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: editName, phone: editPhone });
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

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

  const completedCount = bookings.filter((b) => b.status === "Completed").length;

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
            tintColor={theme.primary}
            colors={[theme.primary]}
            progressBackgroundColor={theme.screenBg}
          />
        }
      >
        {/* Light blue bg — extends to half of profile card */}
        <View style={[styles.headerBg, { height: topPad + 16 + 36 + 16 + 44 }]} />

        {/* Profile card — overlaps header */}
        <View style={[styles.profileCardWrap, { marginTop: topPad + 16 }]}>
          <Text style={styles.pageTitle}>Profile</Text>
          <View style={styles.profileCard}>
            <View style={styles.profileTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileEmail} numberOfLines={1}>{profile?.email || userEmail || "—"}</Text>
              </View>
              <Pressable style={styles.editBtn} onPress={openEdit}>
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>
            {profile?.phone?.trim() ? (
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={14} color={theme.textMutedOnLight} />
                <Text style={styles.phoneText}>{profile.phone.trim()}</Text>
              </View>
            ) : null}
          </View>

        </View>

        {/* Content */}
        <View style={styles.content}>
          <SectionTitle>Account</SectionTitle>
          <View style={styles.card}>
            <MenuRow
              icon="person-outline"
              title="Personal Information"
              iconBg="#ede9fe"
              iconColor="#7c3aed"
              onPress={openEdit}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="ticket-outline"
              title="My Queue & Bookings"
              iconBg="#e0e7ff"
              iconColor="#4f46e5"
              onPress={() => tabNav.navigate("Queue")}
            />
          </View>


          <SectionTitle>General</SectionTitle>
          <View style={styles.card}>
            <MenuRow
              icon="bookmark-outline"
              title={`Saved Branches (${favoriteIds.length})`}
              iconBg="#fef9c3"
              iconColor="#a16207"
              onPress={() => {
                if (navigationRef.isReady()) navigationRef.navigate("SavedBranches");
              }}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="settings-outline"
              title="Settings"
              iconBg="#f1f5f9"
              iconColor="#64748b"
              onPress={() => Alert.alert("Settings", "Settings page coming soon.")}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="language-outline"
              title="Language"
              iconBg="#e0f2fe"
              iconColor="#0284c7"
              onPress={() => Alert.alert("Language", "Language selection coming soon.")}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="notifications-outline"
              title="Notifications"
              iconBg="#dcfce7"
              iconColor="#16a34a"
              onPress={() => {
                if (navigationRef.isReady()) navigationRef.navigate("Notifications" as never);
              }}
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="location-outline"
              title="Location"
              iconBg="#fee2e2"
              iconColor="#dc2626"
              subtitle={locationBusy ? "Getting GPS…" : undefined}
              onPress={() => void requestLocation()}
            />
          </View>

          <SectionTitle>Support</SectionTitle>
          <View style={styles.card}>
            <MenuRow
              icon="help-circle-outline"
              title="Help & FAQ"
              iconBg="#f1f5f9"
              iconColor="#64748b"
              onPress={() =>
                Alert.alert(
                  "Help",
                  "• Home: browse branches, book, and see your active ticket.\n• Booking: pick a branch, service, then a time slot.\n• Queue: live status for your tickets; pull down to refresh.",
                )
              }
            />
            <View style={styles.menuDivider} />
            <MenuRow
              icon="star-outline"
              title="Rate This App"
              iconBg="#fff7ed"
              iconColor="#ea580c"
              onPress={() => Alert.alert("Thank you!", "Rating feature coming soon.")}
            />
          </View>

          <View style={[styles.card, { marginTop: 16 }]}>
            <MenuRow
              icon="log-out-outline"
              title="Log Out"
              danger
              onPress={confirmSignOut}
            />
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+60 12-345 6789"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
            />

            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={() => void saveEdit()}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Changes"}</Text>
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={() => setEditVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 120 },
  // Navy header background — positioned absolute, covers top area
  headerBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.headerNavy,
  },
  profileCardWrap: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 16,
    marginLeft: 4,
  },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "900", color: "#fff" },
  profileName: { fontSize: 18, fontWeight: "800", color: theme.textOnLight },
  profileEmail: { fontSize: 13, color: theme.textMutedOnLight, marginTop: 2 },
  editBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  editBtnText: { fontSize: 13, fontWeight: "700", color: theme.textOnLight },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9",
  },
  phoneText: { fontSize: 14, color: theme.textMutedOnLight, fontWeight: "600" },
  // Content
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.textMutedOnLight,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuRowPressed: { backgroundColor: "#f8fafc" },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapDanger: { backgroundColor: "rgba(239,68,68,0.1)" },
  menuTextCol: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 15, fontWeight: "600", color: theme.textOnLight },
  menuTitleDanger: { color: theme.danger },
  menuSubtitle: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 2 },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#f1f5f9", marginLeft: 64 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.textOnLight, marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: "700", color: theme.textMutedOnLight, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textOnLight,
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: theme.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: theme.textMutedOnLight },
});
