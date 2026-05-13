import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Image, Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { RootStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "BranchDetail">;

export function BranchDetailScreen({ navigation, route }: Props) {
  const { branch } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { profile, savePreferredBranch, busy } = useCustomer();
  const isPreferred = profile?.preferredBranchId === branch.id;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: topPad }]}>
          <Pressable style={[styles.backFab, { top: topPad }]} onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          {branch.imageUrl ? (
            <Image source={{ uri: branch.imageUrl }} style={styles.heroImg} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImg, styles.heroPlaceholder]}>
              <Ionicons name="business" size={48} color={theme.accent} />
            </View>
          )}
          <View style={styles.heroBottomFade} />
          <Text style={styles.heroTitle}>{branch.name}</Text>
        </View>

        <View style={styles.sheet}>
          {branch.state ? <Text style={styles.stateLine}>{branch.state}</Text> : null}
          {branch.openingStatus === "Open" ? (
            <Text style={styles.openNow}>Open now</Text>
          ) : (
            <Text style={styles.closed}>Currently closed</Text>
          )}
          {branch.address ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={18} color={theme.primary} />
              <Text style={styles.addr}>{branch.address}</Text>
            </View>
          ) : null}
          {branch.operatingHours ? (
            <View style={styles.row}>
              <Ionicons name="time-outline" size={18} color={theme.primary} />
              <Text style={styles.hours}>{branch.operatingHours}</Text>
            </View>
          ) : null}

          <Text style={styles.section}>Services at this branch</Text>
          <View style={styles.chips}>
            {branch.services.map((s) => (
              <View key={s.id} style={styles.chip}>
                <Text style={styles.chipText}>{s.name}</Text>
              </View>
            ))}
          </View>

          <PrimaryButton
            label={isPreferred ? "Clear preferred branch" : "Save as preferred branch"}
            variant={isPreferred ? "ghost" : "primary"}
            icon={isPreferred ? "close-circle-outline" : "star-outline"}
            disabled={busy}
            onPress={() => void savePreferredBranch(isPreferred ? null : branch.id)}
          />
          <PrimaryButton
            label="Book a turn here"
            variant="success"
            icon="calendar-outline"
            onPress={() => {
              navigation.navigate("MainTabs", {
                screen: "Booking",
                params: { screen: "BookingServices", params: { branch } },
              });
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.screenBg },
  hero: { backgroundColor: theme.headerNavy },
  backFab: {
    position: "absolute",
    left: 16,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroImg: { width: "100%", height: 220 },
  heroPlaceholder: { backgroundColor: "#1a3354", alignItems: "center", justifyContent: "center" },
  heroBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    backgroundColor: "rgba(4,51,107,0.55)",
  },
  heroTitle: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sheet: {
    marginTop: -14,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  stateLine: { fontSize: 13, fontWeight: "700", color: theme.accent, marginBottom: 6 },
  openNow: { color: theme.success, fontWeight: "800", marginBottom: 10 },
  closed: { color: theme.danger, fontWeight: "800", marginBottom: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 10 },
  addr: { flex: 1, color: theme.textOnLight, fontSize: 14, lineHeight: 20 },
  hours: { flex: 1, color: theme.textMutedOnLight, fontSize: 14, lineHeight: 20 },
  section: { fontSize: 16, fontWeight: "800", color: theme.textOnLight, marginTop: 8, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    backgroundColor: "#e8eef9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.primaryDark },
});
