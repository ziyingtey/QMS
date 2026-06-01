import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../context/CustomerContext";
import type { RootStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "SavedBranches">;

export function SavedBranchesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { profile, branches } = useCustomer();
  const favoriteIds = profile?.favoriteBranchIds ?? [];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Saved Branches</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 120 }}>
        {favoriteIds.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="bookmark-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyText}>No saved branches yet</Text>
            <Text style={styles.emptySub}>Tap the heart icon on a branch to save it here</Text>
          </View>
        ) : (
          favoriteIds.map((id) => {
            const branch = branches.find((b) => b.id === id);
            if (!branch) return null;
            return (
              <Pressable
                key={id}
                style={styles.card}
                onPress={() => navigation.navigate("BranchDetail", { branch })}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="location" size={18} color={theme.primaryDark} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {branch.name}{branch.state ? <Text style={styles.cardState}> · {branch.state}</Text> : null}
                  </Text>
                  {branch.address ? (
                    <Text style={styles.cardAddr} numberOfLines={1}>{branch.address}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.screenBg },
  header: {
    backgroundColor: theme.headerNavy,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 24, fontWeight: "800", color: "#fff" },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: "700", color: theme.textOnLight },
  emptySub: { fontSize: 13, color: theme.textMutedOnLight },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#edf2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: "700", color: theme.textOnLight },
  cardAddr: { fontSize: 12, color: theme.textMutedOnLight, marginTop: 2 },
  cardState: { fontSize: 11, color: theme.primaryDark, fontWeight: "600", marginTop: 2 },
});
