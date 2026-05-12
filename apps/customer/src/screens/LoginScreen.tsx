import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const {
    authMode,
    setAuthMode,
    email,
    setEmail,
    password,
    setPassword,
    registerName,
    setRegisterName,
    onLogin,
    busy,
  } = useCustomer();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20), paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar style="light" />
        <View style={styles.logoCircle}>
          <Ionicons name="ticket" size={36} color={theme.primary} />
        </View>
        <Text style={styles.title}>IH-QMS</Text>
        <Text style={styles.sub}>Customer · branches, bookings & queue</Text>

        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setAuthMode("login")}
            style={[styles.modeChip, authMode === "login" && styles.modeChipOn]}
          >
            <Text style={[styles.modeLabel, authMode === "login" && styles.modeLabelOn]}>Sign in</Text>
          </Pressable>
          <Pressable
            onPress={() => setAuthMode("register")}
            style={[styles.modeChip, authMode === "register" && styles.modeChipOn]}
          >
            <Text style={[styles.modeLabel, authMode === "register" && styles.modeLabelOn]}>Register</Text>
          </Pressable>
        </View>

        {authMode === "register" ? (
          <TextInput
            style={styles.input}
            placeholder="Display name (optional)"
            placeholderTextColor={theme.textMuted}
            value={registerName}
            onChangeText={setRegisterName}
            autoCapitalize="words"
          />
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <PrimaryButton
          label={authMode === "register" ? "Create account" : "Sign in"}
          icon="log-in-outline"
          disabled={busy}
          onPress={() => void onLogin()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 22, backgroundColor: theme.bg },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: theme.bgCard,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: "900", color: theme.text, textAlign: "center" },
  sub: { color: theme.textMuted, textAlign: "center", marginTop: 8, marginBottom: 28 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  modeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  modeChipOn: { borderColor: theme.primary, backgroundColor: theme.chip },
  modeLabel: { color: theme.textMuted, fontWeight: "700" },
  modeLabelOn: { color: theme.text },
  input: {
    backgroundColor: theme.bgCard,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
});
