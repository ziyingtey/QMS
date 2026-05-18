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
  apiToggleFavoriteBranch,
  probeCustomerSession,
  userFacingApiError,
  type BookingSummary,
  type BranchDto,
  type CustomerProfile,
} from "../api";
import { clearToken, clearUserEmail, readToken, readUserEmail, saveToken, saveUserEmail } from "../authStorage";
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
  /** Add or remove this branch from favorites (server toggle). */
  toggleFavoriteBranch: (branchId: string) => Promise<void>;
  /** Branch id currently waiting on toggle, or null. */
  togglingFavoriteBranchId: string | null;
  requestLocation: () => Promise<void>;
  /** True while acquiring a GPS fix. */
  locationBusy: boolean;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
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
        const [tRaw, em] = await Promise.all([readToken(), readUserEmail()]);
        const trimmed = tRaw?.trim() ?? "";
        if (!trimmed) {
          setToken(null);
          setUserEmail(null);
          return;
        }

        const probe = await probeCustomerSession(trimmed);
        if (probe === "unauthorized") {
          await clearToken();
          await clearUserEmail();
          setToken(null);
          setUserEmail(null);
          return;
        }

        setToken(trimmed);
        setUserEmail(em?.trim() || null);
      } catch {
        setToken(null);
        setUserEmail(null);
      } finally {
        setAuthReady(true);
      }
    })();
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
    const t = await readToken();
    if (!t) return;
    try {
      setBookings(await apiMyBookings(t));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const t = await readToken();
    if (!t) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await apiCustomerMe(t));
    } catch {
      setProfile(null);
    }
  }, []);

  const toggleFavoriteBranch = useCallback(async (branchId: string) => {
    const t = await readToken();
    if (!t) return;
    setTogglingFavoriteBranchId(branchId);
    try {
      setProfile(await apiToggleFavoriteBranch(t, branchId));
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
      const coordSuffix = ` (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`;
      try {
        const places = await Location.reverseGeocodeAsync(coords);
        const p = places[0];
        if (p) {
          const street =
            p.streetNumber && p.street ? `${p.streetNumber} ${p.street}` : p.street ?? p.name ?? "";
          const city = p.city ?? p.district ?? p.subregion ?? "";
          const region = p.region ?? "";
          const parts = [street, city, region].filter((x) => x && x.length > 0);
          setUserLocationLabel(
            parts.length > 0 ? `${parts.join(", ")}${coordSuffix}` : `GPS fix${coordSuffix}`,
          );
        } else {
          setUserLocationLabel(`GPS fix${coordSuffix}`);
        }
      } catch {
        setUserLocationLabel(`GPS fix${coordSuffix}`);
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
      const res =
        authMode === "register"
          ? await apiRegister(email.trim(), password, registerName.trim() || undefined)
          : await apiLogin(email.trim(), password);
      await saveToken(res.token);
      await saveUserEmail(email.trim());
      setToken(res.token);
      setUserEmail(email.trim());
    } catch (e) {
      Alert.alert(authMode === "register" ? "Register failed" : "Login failed", userFacingApiError(e));
    } finally {
      setBusy(false);
    }
  }, [authMode, email, password, registerName]);

  const onLogout = useCallback(async () => {
    await clearToken();
    await clearUserEmail();
    setToken(null);
    setUserEmail(null);
    setBookings([]);
    setProfile(null);
    setUserCoords(null);
    setUserLocationLabel(null);
  }, []);

  const checkIn = useCallback(
    async (bookingId: string) => {
      const t = await readToken();
      if (!t) return;
      setBusy(true);
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        let coords: { latitude: number; longitude: number } | undefined;
        if (perm === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
        await apiCheckIn(t, bookingId, coords);
        Alert.alert("Checked in", coords ? "Location sent — server checks geofence when coordinates are provided." : "Checked in without GPS.");
        await refreshBookings();
      } catch (e) {
        Alert.alert("Check-in", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshBookings],
  );

  const cancelBooking = useCallback(
    async (id: string): Promise<boolean> => {
      const t = await readToken();
      if (!t) {
        Alert.alert("Sign in required", "Log in from the Profile tab to manage bookings.");
        return false;
      }
      setBusy(true);
      try {
        await apiCancelBooking(t, id);
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
        toggleFavoriteBranch,
        togglingFavoriteBranchId,
        requestLocation,
        locationBusy,
        onLogin,
        onLogout,
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
      toggleFavoriteBranch,
      togglingFavoriteBranchId,
      requestLocation,
      locationBusy,
      onLogin,
      onLogout,
      checkIn,
      cancelBooking,
    ],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}
