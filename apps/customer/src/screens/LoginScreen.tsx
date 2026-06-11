import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";
import { describePasswordPolicyFailure, getPasswordRuleChecks } from "../utils/passwordPolicy";

const qgoWordmark = require("../../assets/qgo-wordmark.png") as number;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Empty is valid (optional). Otherwise digits + spaces, +, -, (); 8–15 digits. */
function isOptionalPhoneValid(phone: string): boolean {
  const t = phone.trim();
  if (!t) return true;
  if (t.length > 32) return false;
  if (!/^[\d\s+()-]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 8 && digits <= 15;
}

type FieldErrors = Partial<Record<"email" | "password" | "confirm" | "phone", string>>;

function PasswordRuleHints({ password }: { password: string }) {
  const c = getPasswordRuleChecks(password);
  const items: { ok: boolean; label: string }[] = [
    { ok: c.minLength, label: "At least 6 characters" },
    { ok: c.hasUpper, label: "Uppercase letter (A–Z)" },
    { ok: c.hasLower, label: "Lowercase letter (a–z)" },
    { ok: c.hasDigit, label: "Number (0–9)" },
    { ok: c.hasSymbol, label: "Symbol (e.g. @, #, $, %)" },
  ];
  return (
    <View style={styles.ruleHints}>
      <Text style={styles.ruleHintsTitle}>Your password needs:</Text>
      {items.map((it) => (
        <View key={it.label} style={styles.ruleRow}>
          <Ionicons name={it.ok ? "checkmark-circle" : "ellipse-outline"} size={17} color={it.ok ? "#00804a" : "#94a3b8"} />
          <Text style={[styles.ruleRowText, it.ok && styles.ruleRowTextMet]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

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
    registerPhone,
    setRegisterPhone,
    onLogin,
    busy,
    authFormError,
    clearAuthFormError,
    resendVerificationEmail,
    verifyEmailOtp,
    pendingVerification,
    clearPendingVerification,
  } = useCustomer();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setFieldErrors({});
    clearAuthFormError();
    if (authMode === "login") setConfirmPassword("");
  }, [authMode, clearAuthFormError]);

  useEffect(() => {
    if (pendingVerification) {
      setConfirmPassword("");
      setFieldErrors({});
    }
  }, [pendingVerification]);

  const clearFieldErrors = () => {
    setFieldErrors({});
    clearAuthFormError();
  };

  const validateAndSubmit = () => {
    const next: FieldErrors = {};
    const em = email.trim();
    if (!em) next.email = "Email is required.";
    else if (!EMAIL_RE.test(em)) next.email = "Enter a valid email address.";

    if (!password) next.password = "Password is required.";
    else if (authMode === "register") {
      const pwdFail = describePasswordPolicyFailure(password);
      if (pwdFail) next.password = pwdFail;
    }

    if (authMode === "register") {
      if (password !== confirmPassword) next.confirm = "Passwords do not match.";
      if (!isOptionalPhoneValid(registerPhone)) {
        next.phone = "Enter a valid phone number, or leave this blank.";
      }
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    void onLogin();
  };

  const topPad =
    (Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 20)) + 48;
  const bottomPad = insets.bottom + 40;

  if (pendingVerification) {
    const em = pendingVerification.email;
    const openMail = () => {
      void Linking.openURL(`mailto:${encodeURIComponent(em)}`);
    };

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <StatusBar style="dark" />
          <View style={styles.brandArea}>
            <Image source={qgoWordmark} style={styles.wordmark} accessibilityLabel="QGo" />
            <Text style={styles.brandSub}>Skip the queue, book ahead</Text>
          </View>

          <View style={styles.sentCard}>
            <Text style={styles.sentTitle}>Check your email</Text>
            <Text style={styles.sentLead}>We sent a 6-digit verification code to:</Text>
            <Text style={styles.sentEmail}>{em}</Text>
            {pendingVerification.usedDryRun ? (
              <Text style={styles.dryRunHint}>
                No email was sent to Gmail (or anywhere). The API is in SMTP dry-run mode: nothing is delivered to Inbox or Spam.
                {"\n\n"}
                To verify without mail: look at the terminal where the API is running, copy the 6-digit code from the log, enter it below, then tap Verify code.
                {"\n\n"}
                To get a real message in Gmail: set Smtp:DryRun to false and add real SMTP settings (see docs/real-email-verification-smtp.md in the repo).
              </Text>
            ) : (
              <Text style={styles.sentHint}>Open your inbox, copy the 6-digit code, and enter it below.</Text>
            )}

            <Text style={styles.otpLabel}>Verification code</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              placeholderTextColor="#94a3b8"
              value={verificationCode}
              onChangeText={(t) => setVerificationCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
            />

            <Pressable
              style={[styles.submitBtn, { marginBottom: 12 }, busy && { opacity: 0.6 }]}
              onPress={() => void verifyEmailOtp(verificationCode)}
              disabled={busy}
            >
              <Text style={styles.submitText}>{busy ? "Please wait…" : "Verify code"}</Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryBtn, busy && { opacity: 0.6 }]}
              onPress={() => void openMail()}
              disabled={busy}
            >
              <Ionicons name="mail-outline" size={20} color={theme.headerNavy} style={{ marginRight: 8 }} />
              <Text style={styles.secondaryBtnText}>Open email app</Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryBtn, busy && { opacity: 0.6 }]}
              onPress={() => void resendVerificationEmail()}
              disabled={busy}
            >
              <Ionicons name="refresh-outline" size={20} color={theme.headerNavy} style={{ marginRight: 8 }} />
              <Text style={styles.secondaryBtnText}>{busy ? "Please wait…" : "Resend code"}</Text>
            </Pressable>

            <Pressable style={[styles.secondaryBtn, busy && { opacity: 0.6 }]} onPress={() => clearPendingVerification()} disabled={busy}>
              <Text style={styles.secondaryBtnText}>Back to Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad, paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar style="dark" />

        <View style={styles.brandArea}>
          <Image source={qgoWordmark} style={styles.wordmark} accessibilityLabel="QGo" />
          <Text style={styles.brandSub}>Skip the queue, book ahead</Text>
        </View>

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

        <View style={styles.form}>
          {authMode === "register" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor="#94a3b8"
                  value={registerName}
                  onChangeText={(t) => {
                    setRegisterName(t);
                    clearFieldErrors();
                  }}
                  autoCapitalize="words"
                />
              </View>
            </View>
          ) : null}

          {authMode === "register" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Phone (optional)</Text>
              <View style={styles.inputRow}>
                <Ionicons name="call-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor="#94a3b8"
                  value={registerPhone}
                  onChangeText={(t) => {
                    setRegisterPhone(t);
                    clearFieldErrors();
                  }}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
              {fieldErrors.phone ? <Text style={styles.fieldError}>{fieldErrors.phone}</Text> : null}
            </View>
          ) : null}

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={[styles.inputRow, fieldErrors.email ? styles.inputRowError : null]}>
              <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  clearFieldErrors();
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>
            {fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={[styles.inputRow, fieldErrors.password ? styles.inputRowError : null]}>
              <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  clearFieldErrors();
                }}
                secureTextEntry={!passwordVisible}
              />
              <Pressable
                onPress={() => setPasswordVisible((v) => !v)}
                hitSlop={8}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
              >
                <Ionicons name={passwordVisible ? "eye-outline" : "eye-off-outline"} size={20} color="#94a3b8" />
              </Pressable>
            </View>
            {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
            {authMode === "register" ? <PasswordRuleHints password={password} /> : null}
          </View>

          {authMode === "register" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <View style={[styles.inputRow, fieldErrors.confirm ? styles.inputRowError : null]}>
                <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#94a3b8"
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    clearFieldErrors();
                  }}
                  secureTextEntry={!passwordVisible}
                />
              </View>
              {fieldErrors.confirm ? <Text style={styles.fieldError}>{fieldErrors.confirm}</Text> : null}
            </View>
          ) : null}

          {authFormError ? (
            <View style={styles.authBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={20} color="#b91c1c" style={styles.authBannerIcon} />
              <Text style={styles.authBannerText}>{authFormError}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.submitBtn, busy && { opacity: 0.6 }]}
            onPress={validateAndSubmit}
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

          {authMode === "login" ? (
            <Pressable onPress={() => void resendVerificationEmail()} disabled={busy} style={styles.resendWrap}>
              <Text style={styles.resendText}>Resend verification code</Text>
            </Pressable>
          ) : null}
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
  brandArea: {
    alignItems: "center",
    marginBottom: 32,
  },
  wordmark: {
    width: 240,
    height: 56,
    resizeMode: "contain",
  },
  brandSub: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
  },
  sentCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sentTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.headerNavy,
    textAlign: "center",
    marginBottom: 12,
  },
  sentLead: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 6,
  },
  sentEmail: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 14,
  },
  sentHint: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  dryRunHint: {
    fontSize: 13,
    color: "#b45309",
    backgroundColor: "#fffbeb",
    padding: 12,
    borderRadius: 10,
    lineHeight: 19,
    marginBottom: 20,
    overflow: "hidden",
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  otpInput: {
    width: "100%",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 6,
    textAlign: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    color: theme.headerNavy,
    marginBottom: 8,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingVertical: 14,
    marginBottom: 10,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.headerNavy,
  },
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
  fieldError: {
    fontSize: 13,
    color: "#b91c1c",
    marginTop: 6,
    marginLeft: 2,
    lineHeight: 18,
  },
  ruleHints: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  ruleHintsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  ruleRowText: {
    fontSize: 13,
    color: "#64748b",
    flex: 1,
    marginLeft: 8,
  },
  ruleRowTextMet: {
    color: "#166534",
    fontWeight: "500",
  },
  authBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
    marginTop: 4,
  },
  authBannerIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  authBannerText: {
    flex: 1,
    fontSize: 14,
    color: "#991b1b",
    lineHeight: 20,
    fontWeight: "500",
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
  inputRowError: {
    borderColor: "#f87171",
    backgroundColor: "#fff",
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
  resendWrap: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 13,
    color: theme.headerNavy,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
