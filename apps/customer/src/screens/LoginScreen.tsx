import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { apiForgotPassword, apiResetPassword, userFacingApiError } from "../api";
import { useCustomer } from "../context/CustomerContext";
import { theme } from "../theme";
import { describePasswordPolicyFailure, getPasswordRuleChecks, passwordMeetsPolicy } from "../utils/passwordPolicy";

const qgoWordmark = require("../../assets/qgo-wordmark.png") as number;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accept raw token or full reset URL from email. */
function normalizeResetTokenInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    const q = u.searchParams.get("t");
    if (q && q.trim()) return q.trim();
  } catch {
    /* not a valid absolute URL */
  }
  const idx = t.indexOf("?t=");
  if (idx >= 0) {
    const rest = t.slice(idx + 3);
    const cut = rest.indexOf("&");
    const slice = cut >= 0 ? rest.slice(0, cut) : rest;
    try {
      return decodeURIComponent(slice);
    } catch {
      return slice;
    }
  }
  return t;
}

/** Empty is valid (optional). Otherwise digits + spaces, +, -, (); 8–15 digits. */
function isOptionalPhoneValid(phone: string): boolean {
  const t = phone.trim();
  if (!t) return true;
  if (t.length > 32) return false;
  if (!/^[\d\s+()-]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 8 && digits <= 15;
}

type FieldErrors = Partial<Record<"email" | "password" | "confirm" | "phone" | "token" | "resetPassword" | "resetConfirm", string>>;

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
          <Ionicons name={it.ok ? "checkmark-circle" : "ellipse-outline"} size={17} color={it.ok ? theme.success : "#94a3b8"} />
          <Text style={[styles.ruleRowText, it.ok && styles.ruleRowTextMet]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Six single-digit boxes (reference-style OTP entry). */
function OtpSixInputs({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = value.replace(/\D/g, "").slice(0, 6);
  const cells = Array.from({ length: 6 }, (_, i) => digits[i] ?? "");

  return (
    <View style={styles.otpRow}>
      {cells.map((ch, i) => (
        <TextInput
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
          style={styles.otpCell}
          value={ch}
          onChangeText={(t) => {
            const pasted = t.replace(/\D/g, "").slice(0, 6);
            if (pasted.length > 1) {
              onChange(pasted);
              refs.current[Math.min(5, pasted.length)]?.focus();
              return;
            }
            const d = pasted.slice(-1);
            const cur = digits;
            const next = (cur.slice(0, i) + d + cur.slice(i + 1)).replace(/\D/g, "").slice(0, 6);
            onChange(next);
            if (d && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key !== "Backspace") return;
            if (cells[i]) return;
            if (i > 0) refs.current[i - 1]?.focus();
          }}
          keyboardType="number-pad"
          maxLength={i === 0 ? 6 : 1}
          editable={!disabled}
          selectTextOnFocus
          textAlign="center"
        />
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
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotDryUrl, setForgotDryUrl] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [resetNewPwdVisible, setResetNewPwdVisible] = useState(false);

  useEffect(() => {
    setFieldErrors({});
    clearAuthFormError();
    if (authMode === "login") setConfirmPassword("");
  }, [authMode, clearAuthFormError]);

  useEffect(() => {
    if (pendingVerification) {
      setConfirmPassword("");
      setFieldErrors({});
      setVerificationCode("");
      setForgotOpen(false);
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

  const closeForgot = () => {
    setForgotOpen(false);
    setForgotSent(false);
    setForgotError(null);
    setForgotDryUrl(null);
    setResetToken("");
    setResetPassword("");
    setResetConfirm("");
    setResetConfirmVisible(false);
    setResetNewPwdVisible(false);
    setFieldErrors({});
  };

  const sendForgotInstructions = async () => {
    const em = email.trim();
    setForgotError(null);
    if (!em || !EMAIL_RE.test(em)) {
      setForgotError("Enter the email for your account.");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await apiForgotPassword(em);
      setForgotSent(true);
      setForgotDryUrl(typeof res.resetUrl === "string" ? res.resetUrl : null);
    } catch (e) {
      setForgotError(userFacingApiError(e));
    } finally {
      setForgotBusy(false);
    }
  };

  const submitPasswordReset = async () => {
    const next: FieldErrors = {};
    const tok = normalizeResetTokenInput(resetToken);
    if (!tok) next.token = "Paste the reset token from your email (or paste the full reset link).";
    const rp = resetPassword;
    const rc = resetConfirm;
    const fail = describePasswordPolicyFailure(rp);
    if (fail) next.resetPassword = fail;
    if (rp !== rc) next.resetConfirm = "Passwords do not match.";
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setForgotBusy(true);
    setForgotError(null);
    try {
      const { message } = await apiResetPassword(tok, rp);
      Alert.alert("Password updated", message);
      closeForgot();
      setPassword("");
    } catch (e) {
      setForgotError(userFacingApiError(e));
    } finally {
      setForgotBusy(false);
    }
  };

  const topPad =
    (Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) + 8 : Math.max(insets.top, 20)) + 24;
  const bottomPad = insets.bottom + 40;

  if (forgotOpen) {
    return (
      <KeyboardAvoidingView style={styles.verifyRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.verifyScroll, { paddingTop: topPad, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <StatusBar style="dark" />
          <Pressable
            style={[styles.verifyClose, { top: Math.max(insets.top, 12) }]}
            onPress={() => closeForgot()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color="#64748b" />
          </Pressable>

          <View style={styles.verifyCard}>
            <View style={styles.verifyHeroIcon}>
              <Ionicons name="key-outline" size={32} color={theme.headerNavy} />
            </View>
            <Text style={styles.verifyTitle}>Forgot password</Text>
            <Text style={styles.verifySubtitle}>
              {forgotSent
                ? "If that email matches a verified account, check your inbox for a reset link and token. Then set a new password below."
                : "Enter your account email. We will send reset instructions if a verified account exists."}
            </Text>

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
                  setFieldErrors((x) => ({ ...x, email: undefined }));
                  setForgotError(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!forgotBusy}
              />
            </View>

            {!forgotSent ? (
              <Pressable
                style={[styles.submitBtn, { marginTop: 16 }, (forgotBusy || busy) && { opacity: 0.6 }]}
                onPress={() => void sendForgotInstructions()}
                disabled={forgotBusy || busy}
              >
                <Text style={styles.submitText}>{forgotBusy ? "Please wait…" : "Send reset instructions"}</Text>
              </Pressable>
            ) : null}

            {forgotDryUrl ? (
              <Text style={styles.dryRunHint} selectable>
                SMTP dry-run: reset link (tap to open in browser):{"\n"}
                {forgotDryUrl}
              </Text>
            ) : null}

            {forgotSent ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Reset token</Text>
                <View style={[styles.inputRow, fieldErrors.token ? styles.inputRowError : null]}>
                  <Ionicons name="link-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Paste from email"
                    placeholderTextColor="#94a3b8"
                    value={resetToken}
                    onChangeText={(t) => {
                      setResetToken(t);
                      setFieldErrors((x) => ({ ...x, token: undefined }));
                      setForgotError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!forgotBusy}
                  />
                </View>
                {fieldErrors.token ? <Text style={styles.fieldError}>{fieldErrors.token}</Text> : null}

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>New password</Text>
                <View style={[styles.inputRow, fieldErrors.resetPassword ? styles.inputRowError : null]}>
                  <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor="#94a3b8"
                    value={resetPassword}
                    onChangeText={(t) => {
                      setResetPassword(t);
                      setFieldErrors((x) => ({ ...x, resetPassword: undefined }));
                      setForgotError(null);
                    }}
                    secureTextEntry={!resetNewPwdVisible}
                    editable={!forgotBusy}
                  />
                  <Pressable
                    onPress={() => setResetNewPwdVisible((v) => !v)}
                    hitSlop={8}
                    style={styles.eyeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={resetNewPwdVisible ? "Hide new password" : "Show new password"}
                  >
                    <Ionicons name={resetNewPwdVisible ? "eye-outline" : "eye-off-outline"} size={20} color="#94a3b8" />
                  </Pressable>
                </View>
                {fieldErrors.resetPassword ? <Text style={styles.fieldError}>{fieldErrors.resetPassword}</Text> : null}
                <PasswordRuleHints password={resetPassword} />

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Confirm new password</Text>
                <View style={[styles.inputRow, fieldErrors.resetConfirm ? styles.inputRowError : null]}>
                  <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#94a3b8"
                    value={resetConfirm}
                    onChangeText={(t) => {
                      setResetConfirm(t);
                      setFieldErrors((x) => ({ ...x, resetConfirm: undefined }));
                      setForgotError(null);
                    }}
                    secureTextEntry={!resetConfirmVisible}
                    editable={!forgotBusy}
                  />
                  <Pressable
                    onPress={() => setResetConfirmVisible((v) => !v)}
                    hitSlop={8}
                    style={styles.eyeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={resetConfirmVisible ? "Hide confirm password" : "Show confirm password"}
                  >
                    <Ionicons name={resetConfirmVisible ? "eye-outline" : "eye-off-outline"} size={20} color="#94a3b8" />
                  </Pressable>
                </View>
                {fieldErrors.resetConfirm ? <Text style={styles.fieldError}>{fieldErrors.resetConfirm}</Text> : null}

                <Pressable
                  style={[
                    styles.submitBtn,
                    { marginTop: 16 },
                    (forgotBusy || busy || !passwordMeetsPolicy(resetPassword) || resetPassword !== resetConfirm) && {
                      opacity: 0.55,
                    },
                  ]}
                  onPress={() => void submitPasswordReset()}
                  disabled={forgotBusy || busy || !passwordMeetsPolicy(resetPassword) || resetPassword !== resetConfirm}
                >
                  <Text style={styles.submitText}>{forgotBusy ? "Please wait…" : "Update password"}</Text>
                </Pressable>
              </>
            ) : null}

            {forgotError ? (
              <View style={[styles.authBanner, { marginTop: 14 }]} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={20} color="#b91c1c" style={styles.authBannerIcon} />
                <Text style={styles.authBannerText}>{forgotError}</Text>
              </View>
            ) : null}

            <Pressable style={[styles.linkMuted, { marginTop: 20 }]} onPress={() => closeForgot()}>
              <Text style={styles.linkMutedText}>Back to Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (pendingVerification) {
    const em = pendingVerification.email;
    const openMail = () => {
      void Linking.openURL(`mailto:${encodeURIComponent(em)}`);
    };

    return (
      <KeyboardAvoidingView style={styles.verifyRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.verifyScroll, { paddingTop: topPad, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <StatusBar style="dark" />
          <Pressable
            style={[styles.verifyClose, { top: Math.max(insets.top, 12) }]}
            onPress={() => clearPendingVerification()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color="#64748b" />
          </Pressable>

          <View style={styles.verifyCard}>
            <View style={styles.verifyHeroIcon}>
              <Ionicons name="mail-unread-outline" size={34} color={theme.headerNavy} />
            </View>
            <Text style={styles.verifyTitle}>Verify your email</Text>
            <Text style={styles.verifySubtitle}>
              We sent a 6-digit code to your inbox. Enter it below to finish setting up your account.
            </Text>
            <Text style={styles.sentEmail}>{em}</Text>

            {pendingVerification.usedDryRun ? (
              <Text style={styles.dryRunHint}>
                No email was sent (SMTP dry-run). Check the API terminal for the 6-digit code, or configure real SMTP (see
                docs/real-email-verification-smtp.md).
              </Text>
            ) : (
              <Text style={styles.sentHint}>Check your inbox and spam folder for the code.</Text>
            )}

            <Text style={styles.otpLabel}>Verification code</Text>
            <OtpSixInputs value={verificationCode} onChange={setVerificationCode} disabled={busy} />

            <Pressable
              style={[styles.submitBtn, { marginTop: 20 }, busy && { opacity: 0.6 }]}
              onPress={() => void verifyEmailOtp(verificationCode.replace(/\D/g, ""))}
              disabled={busy}
            >
              <Text style={styles.submitText}>{busy ? "Please wait…" : "Verify email"}</Text>
            </Pressable>

            <Text style={styles.changeEmailRow}>
              Want to change your email?{" "}
              <Text
                style={styles.changeEmailLink}
                onPress={() => {
                  clearPendingVerification();
                  setAuthMode("register");
                }}
              >
                Change here
              </Text>
            </Text>

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
            {authMode === "login" ? (
              <Pressable style={styles.forgotRow} onPress={() => setForgotOpen(true)} hitSlop={8}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            ) : null}
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
                  secureTextEntry={!confirmPasswordVisible}
                />
                <Pressable
                  onPress={() => setConfirmPasswordVisible((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={confirmPasswordVisible ? "Hide confirm password" : "Show confirm password"}
                >
                  <Ionicons name={confirmPasswordVisible ? "eye-outline" : "eye-off-outline"} size={20} color="#94a3b8" />
                </Pressable>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  verifyRoot: {
    flex: 1,
    backgroundColor: theme.authWarmBg,
  },
  verifyScroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
  },
  verifyClose: {
    position: "absolute",
    right: 18,
    zIndex: 2,
    padding: 8,
  },
  verifyCard: {
    backgroundColor: theme.authCard,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 28,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.authOtpBorder,
    shadowColor: "#04336b",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  verifyHeroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eef4ff",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  verifyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.headerNavy,
    textAlign: "center",
    marginBottom: 10,
  },
  verifySubtitle: {
    fontSize: 14,
    color: theme.textMutedOnLight,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 8,
  },
  changeEmailRow: {
    fontSize: 14,
    color: theme.textMutedOnLight,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  changeEmailLink: {
    color: theme.headerNavy,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  otpCell: {
    width: 48,
    height: 52,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.authOtpBorder,
    backgroundColor: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
    color: theme.headerNavy,
    paddingVertical: 0,
  },
  linkMuted: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkMutedText: {
    fontSize: 14,
    color: theme.textMutedOnLight,
    fontWeight: "600",
  },
  forgotRow: {
    marginTop: 10,
    alignSelf: "flex-end",
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.headerNavy,
    textDecorationLine: "underline",
  },
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
    marginBottom: 16,
  },
  dryRunHint: {
    fontSize: 13,
    color: "#b45309",
    backgroundColor: "#fffbeb",
    padding: 12,
    borderRadius: 10,
    lineHeight: 19,
    marginBottom: 16,
    overflow: "hidden",
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 10,
    alignSelf: "flex-start",
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
});
