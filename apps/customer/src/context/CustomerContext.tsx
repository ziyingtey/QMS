import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  apiBranches,
  apiCancelBooking,
  apiCheckIn,
  apiCustomerMe,
  apiLogin,
  apiMyBookings,
  apiRegister,
  apiResendVerificationEmail,
  apiToggleFavoriteBranch,
  probeCustomerSession,
  userFacingApiError,
  type BookingSummary,
  type BranchDto,
  type CustomerProfile,
} from "../api";
import {
  clearAuthStores,
  readUserEmail,
  saveRefreshToken,
  saveToken,
  saveUserEmail,
  readRefreshToken,
} from "../authStorage";
import { isRegisterPending } from "../authTypes";
import { getValidCustomerAccessToken, revokeCustomerRefreshRemote, subscribeCustomerAccessToken } from "../customerSession";
import { navigationRef } from "../navigation/navigationRef";
import { useBranchRealtime } from "../useBranchRealtime";

type CustomerContextValue = {
  /** False until SecureStore has been read (and optional session probe finished). */
  authReady: boolean;
  token: string | null;
  userEmail: string | null;
  busy: boolean;
  branches: BranchDto[];
  bookings: BookingSummary[];
  /** Server profile (name, phone, favorite branches) — loaded after login. */
  profile: CustomerProfile | null;
  userCoords: { latitude: number; longitude: number } | null;
  /** Resolved street/city from GPS via Expo reverse geocode when possible. */
  userLocationLabel: string | null;
  authMode: "login" | "register";
  setAuthMode: (m: "login" | "register") => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  registerName: string;
  setRegisterName: (s: string) => void;
  loadBranches: () => Promise<void>;
  refreshBookings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<void>;
  /** Add or remove this branch from favorites (server toggle). */
  toggleFavoriteBranch: (branchId: string) => Promise<void>;
  /** Branch id currently waiting on toggle, or null. */
  togglingFavoriteBranchId: string | null;
  requestLocation: () => Promise<void>;
  /** True while acquiring a GPS fix. */
  locationBusy: boolean;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  checkIn: (bookingId: string) => Promise<void>;
  cancelBooking: (id: string) => Promise<boolean>;
  navigateToQueueTrack: (branchId: string, ticket: string, bookingId?: string) => void;
};

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function useCustomer() {
  const c = useContext(CustomerContext);
  if (!c) throw new Error("useCustomer must be used within CustomerProvider");
  return c;
}

function navigateToQueueTrack(branchId: string, ticket: string, bookingId?: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate("MainTabs", {
    screen: "Queue",
    params: {
      screen: "QueueTrack",
      params: { branchId, ticket, bookingId },
    },
  });
}

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLocationLabel, setUserLocationLabel] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [togglingFavoriteBranchId, setTogglingFavoriteBranchId] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerName, setRegisterName] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const em = await readUserEmail();
        const access = await getValidCustomerAccessToken();
        if (!access) {
          setToken(null);
          setUserEmail(em?.trim() || null);
          return;
        }

        const probe = await probeCustomerSession(access);
        if (probe === "unauthorized") {
          await clearAuthStores();
          setToken(null);
          setUserEmail(null);
          return;
        }

        if (probe === "unavailable") {
          setToken(access);
          setUserEmail(em?.trim() || null);
          return;
        }

        setToken(access);
        setUserEmail(em?.trim() || null);
      } catch {
        setToken(null);
        setUserEmail(null);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    return subscribeCustomerAccessToken((next) => {
      if (!next) {
        setToken(null);
        setUserEmail(null);
        setBookings([]);
        setProfile(null);
        return;
      }
      setToken(next);
    });
  }, []);

  const loadBranches = useCallback(async () => {
    setBusy(true);
    try {
      const list = await apiBranches();
      setBranches(list);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshBookings = useCallback(async () => {
    const t = await getValidCustomerAccessToken();
    if (!t) return;
    try {
      setBookings(await apiMyBookings());
    } catch {
      /* ignore */
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const t = await getValidCustomerAccessToken();
    if (!t) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await apiCustomerMe());
    } catch {
      setProfile(null);
    }
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; phone?: string }) => {
    const t = await getValidCustomerAccessToken();
    if (!t) return;
    const { apiUpdateProfile } = await import("../api");
    setProfile(await apiUpdateProfile(data));
  }, []);

  const toggleFavoriteBranch = useCallback(async (branchId: string) => {
    const t = await getValidCustomerAccessToken();
    if (!t) return;
    setTogglingFavoriteBranchId(branchId);
    try {
      setProfile(await apiToggleFavoriteBranch(branchId));
    } catch (e) {
      Alert.alert("Favorite branches", e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingFavoriteBranchId(null);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void loadBranches();
      void refreshBookings();
      void refreshProfile();
    }
  }, [token, loadBranches, refreshBookings, refreshProfile]);

  const watchedBranchIds = useMemo(() => (token && branches.length > 0 ? branches.map((b) => b.id) : []), [token, branches]);

  useBranchRealtime({
    branchIds: watchedBranchIds,
    enabled: watchedBranchIds.length > 0,
    accessToken: token,
    onEvent: () => {
      void refreshBookings();
      void loadBranches();
    },
  });

  const requestLocation = useCallback(async () => {
    setLocationBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setUserCoords(null);
        setUserLocationLabel("Turn on location for nearby sorting & your address");
        return;
      }
      if (Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          /* optional on some builds */
        }
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserCoords(coords);
      try {
        const places = await Location.reverseGeocodeAsync(coords);
        const p = places[0];
        if (p) {
          const street =
            p.streetNumber && p.street ? `${p.streetNumber} ${p.street}` : p.street ?? p.name ?? "";
          const city = p.city ?? p.district ?? p.subregion ?? "";
          const region = p.region ?? "";
          const parts = [street, city, region].filter((x) => x && x.length > 0);
          setUserLocationLabel(parts.length > 0 ? parts.join(", ") : "Location found");
        } else {
          setUserLocationLabel("Location found");
        }
      } catch {
        setUserLocationLabel("Location found");
      }
    } catch (e) {
      setUserCoords(null);
      const hint =
        Platform.OS === "android"
          ? " On Android Emulator: open ⋯ → Location and set latitude/longitude to match where you are testing."
          : "";
      setUserLocationLabel(
        e instanceof Error ? `Could not read GPS: ${e.message}.${hint}` : `Could not read GPS.${hint}`,
      );
    } finally {
      setLocationBusy(false);
    }
  }, []);

  const onLogin = useCallback(async () => {
    setBusy(true);
    try {
      if (authMode === "register") {
        const res = await apiRegister(email.trim(), password, registerName.trim() || undefined);
        if (isRegisterPending(res)) {
          Alert.alert(
            "Check your email",
            res.message + (res.emailSent ? "" : "\n\n(If you did not receive it, try Resend verification after switching to Sign in.)"),
          );
          setAuthMode("login");
          setPassword("");
          return;
        }
        await saveToken(res.token);
        if (res.refreshToken) await saveRefreshToken(res.refreshToken);
        await saveUserEmail(email.trim());
        setToken(res.token);
        setUserEmail(email.trim());
        return;
      }

      const res = await apiLogin(email.trim(), password);
      await saveToken(res.token);
      if (res.refreshToken) await saveRefreshToken(res.refreshToken);
      await saveUserEmail(email.trim());
      setToken(res.token);
      setUserEmail(email.trim());
    } catch (e) {
      Alert.alert(authMode === "register" ? "Register failed" : "Login failed", userFacingApiError(e));
    } finally {
      setBusy(false);
    }
  }, [authMode, email, password, registerName]);

  const resendVerificationEmail = useCallback(async () => {
    const em = email.trim();
    if (!em) {
      Alert.alert("Email required", "Enter your email above, then tap Resend verification.");
      return;
    }
    setBusy(true);
    try {
      const { message } = await apiResendVerificationEmail(em);
      Alert.alert("Verification email", message);
    } catch (e) {
      Alert.alert("Could not resend", userFacingApiError(e));
    } finally {
      setBusy(false);
    }
  }, [email]);

  const onLogout = useCallback(async () => {
    const r = await readRefreshToken();
    if (r) await revokeCustomerRefreshRemote(r);
    await clearAuthStores();
    setToken(null);
    setUserEmail(null);
    setBookings([]);
    setProfile(null);
    setUserCoords(null);
    setUserLocationLabel(null);
  }, []);

  const checkIn = useCallback(
    async (bookingId: string) => {
      const t = await getValidCustomerAccessToken();
      if (!t) return;
      setBusy(true);
      try {
        await apiCheckIn(bookingId);
        Alert.alert("Marked as arrived", "You can join the call queue for your slot. Pull down on Queue to refresh.");
        await refreshBookings();
      } catch (e) {
        Alert.alert("Arrived", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshBookings],
  );

  const cancelBooking = useCallback(
    async (id: string): Promise<boolean> => {
      const t = await getValidCustomerAccessToken();
      if (!t) {
        Alert.alert("Sign in required", "Log in from the Profile tab to manage bookings.");
        return false;
      }
      setBusy(true);
      try {
        await apiCancelBooking(id);
        await refreshBookings();
        return true;
      } catch (e) {
        Alert.alert("Cancel", e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refreshBookings],
  );

  const value = useMemo(
    () =>
      ({
        authReady,
        token,
        userEmail,
        busy,
        branches,
        bookings,
        profile,
        userCoords,
        userLocationLabel,
        authMode,
        setAuthMode,
        email,
        setEmail,
        password,
        setPassword,
        registerName,
        setRegisterName,
        loadBranches,
        refreshBookings,
        refreshProfile,
        updateProfile,
        toggleFavoriteBranch,
        togglingFavoriteBranchId,
        requestLocation,
        locationBusy,
        onLogin,
        onLogout,
        resendVerificationEmail,
        checkIn,
        cancelBooking,
        navigateToQueueTrack,
      }) satisfies CustomerContextValue,
    [
      authReady,
      token,
      userEmail,
      busy,
      branches,
      bookings,
      profile,
      userCoords,
      userLocationLabel,
      authMode,
      email,
      password,
      registerName,
      loadBranches,
      refreshBookings,
      refreshProfile,
      updateProfile,
      toggleFavoriteBranch,
      togglingFavoriteBranchId,
      requestLocation,
      locationBusy,
      onLogin,
      onLogout,
      resendVerificationEmail,
      checkIn,
      cancelBooking,
    ],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}
