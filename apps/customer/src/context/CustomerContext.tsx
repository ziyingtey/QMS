import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import {
  apiBranches,
  apiCancelBooking,
  apiCheckIn,
  apiLogin,
  apiMyBookings,
  apiRegister,
  type BookingSummary,
  type BranchDto,
} from "../api";
import { clearToken, clearUserEmail, readToken, readUserEmail, saveToken, saveUserEmail } from "../authStorage";
import { navigationRef } from "../navigation/navigationRef";
import { useBranchRealtime } from "../useBranchRealtime";

type CustomerContextValue = {
  token: string | null;
  userEmail: string | null;
  busy: boolean;
  branches: BranchDto[];
  bookings: BookingSummary[];
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
  requestLocation: () => Promise<void>;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  checkIn: (bookingId: string) => Promise<void>;
  cancelBooking: (id: string) => Promise<void>;
  navigateToQueueTrack: (branchId: string, ticket: string) => void;
};

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function useCustomer() {
  const c = useContext(CustomerContext);
  if (!c) throw new Error("useCustomer must be used within CustomerProvider");
  return c;
}

function navigateToQueueTrack(branchId: string, ticket: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate("MainTabs", {
    screen: "Queue",
    params: {
      screen: "QueueTrack",
      params: { branchId, ticket },
    },
  });
}

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLocationLabel, setUserLocationLabel] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("customer@qms.demo");
  const [password, setPassword] = useState("Demo123!");
  const [registerName, setRegisterName] = useState("");

  useEffect(() => {
    void (async () => {
      const [t, em] = await Promise.all([readToken(), readUserEmail()]);
      setToken(t);
      setUserEmail(em);
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

  useEffect(() => {
    if (token) {
      void loadBranches();
      void refreshBookings();
    }
  }, [token, loadBranches, refreshBookings]);

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
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setUserLocationLabel("Turn on location for nearby sorting & your address");
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
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
        setUserLocationLabel(parts.length > 0 ? parts.join(", ") : `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      } else {
        setUserLocationLabel(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      }
    } catch {
      setUserLocationLabel(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
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
      Alert.alert(authMode === "register" ? "Register failed" : "Login failed", e instanceof Error ? e.message : String(e));
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
    async (id: string) => {
      const t = await readToken();
      if (!t) return;
      setBusy(true);
      try {
        await apiCancelBooking(t, id);
        await refreshBookings();
      } catch (e) {
        Alert.alert("Cancel", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshBookings],
  );

  const value = useMemo(
    () =>
      ({
        token,
        userEmail,
        busy,
        branches,
        bookings,
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
        requestLocation,
        onLogin,
        onLogout,
        checkIn,
        cancelBooking,
        navigateToQueueTrack,
      }) satisfies CustomerContextValue,
    [
      token,
      userEmail,
      busy,
      branches,
      bookings,
      userCoords,
      userLocationLabel,
      authMode,
      email,
      password,
      registerName,
      loadBranches,
      refreshBookings,
      requestLocation,
      onLogin,
      onLogout,
      checkIn,
      cancelBooking,
    ],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}
