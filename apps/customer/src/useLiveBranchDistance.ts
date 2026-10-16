import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { useCallback, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import { distanceMeters } from "./utils/geo";

export type LivePermission = "unknown" | "granted" | "denied";

export type LiveBranchDistance = {
  permission: LivePermission;
  coords: { latitude: number; longitude: number; accuracy: number | null } | null;
  /** Straight-line distance to the branch in metres (null until first fix). */
  distance: number | null;
  /** Same rule as the backend: distance - min(accuracy, 100) <= geofence. */
  inside: boolean;
  requestPermission: () => Promise<void>;
};

const MAX_TOLERANCE_M = 100;

export function openLocationSettingsAlert() {
  Alert.alert(
    "Location is off for this app",
    "We use your location only to confirm you're at the branch when you check in. You can turn it on in Settings.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => void Linking.openSettings() },
    ],
  );
}

/**
 * Watches the device position while `enabled` and the screen is focused, and computes live distance
 * to the branch. Stops on blur / unmount / when disabled (e.g. after check-in).
 */
export function useLiveBranchDistance(
  branch: { latitude: number; longitude: number; geofenceMeters: number } | null,
  enabled: boolean,
): LiveBranchDistance {
  const [permission, setPermission] = useState<LivePermission>("unknown");
  const [coords, setCoords] = useState<LiveBranchDistance["coords"]>(null);
  const askedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    setPermission(perm.granted ? "granted" : "denied");
    if (!perm.granted && !perm.canAskAgain) openLocationSettingsAlert();
  }, []);

  // On focus: check permission; if never asked, explain first, then ask.
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let cancelled = false;
      void (async () => {
        const perm = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm.granted) {
          setPermission("granted");
        } else if (perm.canAskAgain && !askedRef.current) {
          askedRef.current = true;
          Alert.alert(
            "Check in with your location",
            "When you arrive, we'll use your location only to confirm you're at the branch, so you can check in. Allow location access?",
            [
              { text: "Not now", style: "cancel", onPress: () => setPermission("denied") },
              { text: "Continue", onPress: () => void requestPermission() },
            ],
          );
        } else {
          setPermission("denied");
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [enabled, requestPermission]),
  );

  // Watch position while focused + enabled + granted.
  useFocusEffect(
    useCallback(() => {
      if (!enabled || permission !== "granted") return;
      let sub: Location.LocationSubscription | null = null;
      let stopped = false;
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 8 },
        (p) => setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
      )
        .then((s) => {
          if (stopped) s.remove();
          else sub = s;
        })
        .catch(() => {
          /* location services off — text stays "Finding your location…" */
        });
      return () => {
        stopped = true;
        sub?.remove();
      };
    }, [enabled, permission]),
  );

  const distance =
    coords && branch ? distanceMeters(coords.latitude, coords.longitude, branch.latitude, branch.longitude) : null;
  const tolerance = coords?.accuracy && coords.accuracy > 0 ? Math.min(coords.accuracy, MAX_TOLERANCE_M) : 0;
  const inside =
    !!branch && (branch.geofenceMeters <= 0 || (distance != null && distance - tolerance <= branch.geofenceMeters));

  return { permission, coords, distance, inside, requestPermission };
}
