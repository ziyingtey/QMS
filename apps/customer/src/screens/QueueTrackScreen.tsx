import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiQueueStatus, type QueueStatus } from "../api";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import type { QueueStackParamList } from "../navigation/navigationRef";
import { theme } from "../theme";
import { useBranchRealtime } from "../useBranchRealtime";

type Props = NativeStackScreenProps<QueueStackParamList, "QueueTrack">;

export function QueueTrackScreen({ route }: Props) {
  const { branchId, ticket } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 12);
  const { token } = useCustomer();
  const [status, setStatus] = useState<QueueStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiQueueStatus(branchId, ticket));
    } catch {
      setStatus(null);
    }
  }, [branchId, ticket]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 12000);
    return () => clearInterval(id);
  }, [refresh]);

  const onRealtime = useCallback(() => {
    void refresh();
  }, [refresh]);

  useBranchRealtime({
    branchIds: useMemo(() => [branchId], [branchId]),
    enabled: true,
    accessToken: token,
    onEvent: onRealtime,
  });

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <StatusBar style="light" />
      <Text style={styles.title}>Queue status</Text>
      <View style={styles.live}>
        <View style={styles.dot} />
        <Text style={styles.liveText}>Live · SignalR + poll</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.muted}>Your ticket</Text>
        <Text style={styles.ticket}>{ticket}</Text>
        {status ? (
          <>
            <Text style={styles.service}>{status.serviceName}</Text>
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.lab}>State</Text>
                <Text style={styles.val}>{status.state}</Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.lab}>Ahead</Text>
                <Text style={styles.val}>{status.peopleAhead}</Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.lab}>Est. wait</Text>
                <Text style={styles.val}>{status.estimatedWaitMinutes == null ? "—" : `${status.estimatedWaitMinutes} min`}</Text>
              </View>
            </View>
            {status.currentServingTicketNumber ? (
              <Text style={styles.now}>Now serving: {status.currentServingTicketNumber}</Text>
            ) : null}
            {status.nextEstimatedMessage ? <Text style={styles.hint}>{status.nextEstimatedMessage}</Text> : null}
          </>
        ) : (
          <Text style={styles.muted}>Loading…</Text>
        )}
      </View>
      <PrimaryButton label="Refresh now" variant="ghost" icon="refresh-outline" onPress={() => void refresh()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: theme.text },
  live: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success },
  liveText: { color: theme.success, fontWeight: "700", fontSize: 13 },
  card: {
    backgroundColor: theme.bgCard,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  muted: { color: theme.textMuted },
  ticket: { fontSize: 36, fontWeight: "900", color: theme.accent, letterSpacing: 2 },
  service: { fontSize: 17, fontWeight: "700", color: theme.text, marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, justifyContent: "center" },
  cell: {
    minWidth: "28%",
    backgroundColor: theme.bgElevated,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  lab: { fontSize: 11, color: theme.textMuted },
  val: { fontSize: 17, fontWeight: "800", color: theme.text, marginTop: 4 },
  now: { marginTop: 14, color: theme.warning, fontWeight: "700" },
  hint: { color: theme.success, fontWeight: "600", marginTop: 8, textAlign: "center" },
});
