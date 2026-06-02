import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 20) + 48, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar style="dark" />

        {/* Top branding */}
        <View style={styles.brandArea}>
          <View style={styles.logoWrap}>
            <Ionicons name="people" size={28} color={theme.headerNavy} />
          </View>
          <Text style={styles.brandName}>QGo</Text>
          <Text style={styles.brandSub}>Skip the queue, book ahead</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setAuthMode("login")}
            style={[styles.modeTab, authMode === "login" && styles.modeTabOn]}
          >
            <Text style={[styles.modeText, authMode === "login" && styles.modeTextOn]}>Sign in</Text>
          </Pressable>
          <Pressable
            onPress={() => setAuthMode("register")}
            style={[styles.modeTab, authMode === "register" && styles.modeTabOn]}
          >
            <Text style={[styles.modeText, authMode === "register" && styles.modeTextOn]}>Register</Text>
          </Pressable>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {authMode === "register" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor="#94a3b8"
                  value={registerName}
                  onChangeText={setRegisterName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          ) : null}

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#94a3b8" />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.submitBtn, busy && { opacity: 0.6 }]}
            onPress={() => void onLogin()}
            disabled={busy}
          >
            <Text style={styles.submitText}>
              {busy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}
            </Text>
          </Pressable>

          <Text style={styles.switchText}>
            {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
            <Text
              style={styles.switchLink}
              onPress={() => setAuthMode(authMode === "login" ? "register" : "login")}
            >
              {authMode === "login" ? "Register" : "Sign in"}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    backgroundColor: "#fff",
  },
  // Branding
  brandArea: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  brandName: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.headerNavy,
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
  },
  // Mode toggle
  modeRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modeTabOn: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  modeText: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  modeTextOn: { color: theme.headerNavy, fontWeight: "700" },
  // Form
  form: {
    gap: 0,
  },
  fieldWrap: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0f172a",
  },
  eyeBtn: {
    padding: 4,
  },
  submitBtn: {
    backgroundColor: theme.headerNavy,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: theme.headerNavy,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  switchText: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 13,
    color: "#64748b",
  },
  switchLink: {
    color: theme.headerNavy,
    fontWeight: "700",
  },
});
