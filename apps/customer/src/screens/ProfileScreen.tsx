import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE } from "../config";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { userEmail, onLogout, requestLocation } = useCustomer();

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <View style={styles.avatar}>
        <Ionicons name="person" size={40} color={theme.primary} />
      </View>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.email}>{userEmail ?? "—"}</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>API</Text>
        <Text style={styles.cardVal}>{API_BASE}</Text>
        <Text style={styles.hint}>Set EXPO_PUBLIC_API_URL in .env for device / simulator.</Text>
        <Text style={styles.hint}>
          GPS comes from this device (Expo Location). Simulators often use a fake fixed position; use a real phone for true
          distances. Branch pins use latitude/longitude stored in the QMS database.
        </Text>
      </View>
      <PrimaryButton label="Update device location" variant="ghost" icon="location-outline" onPress={() => void requestLocation()} />
      <PrimaryButton label="Sign out" variant="danger" icon="log-out-outline" onPress={() => void onLogout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, gap: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 8,
  },
  title: { fontSize: 24, fontWeight: "800", color: theme.text, textAlign: "center" },
  email: { color: theme.textMuted, textAlign: "center", fontSize: 15 },
  card: {
    backgroundColor: theme.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 8,
  },
  cardLabel: { fontSize: 12, color: theme.textMuted, fontWeight: "600" },
  cardVal: { color: theme.accent, fontSize: 13, marginTop: 6, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  hint: { color: theme.textMuted, fontSize: 12, marginTop: 8 },
});
