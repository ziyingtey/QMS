import * as Location from "expo-location";
import { Alert, Linking } from "react-native";

export type CheckInCoords = { latitude: number; longitude: number; accuracy?: number };

const FIX_TIMEOUT_MS = 8000;

/**
 * Asks for foreground location and returns the current position for check-in.
 * Returns null (after showing a friendly alert) if permission is denied or no fix is available.
 * Location is only sent to confirm the customer is at the branch.
 */
export async function getCheckInCoords(): Promise<CheckInCoords | null> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Location needed to check in",
      "We use your location only once, to confirm you're at the branch. Please allow location access for this app.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
    return null;
  }

  const toCoords = (p: Location.LocationObject): CheckInCoords => ({
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    accuracy: p.coords.accuracy ?? undefined,
  });

  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (pos) return toCoords(pos);
  } catch {
    /* fall through to last known */
  }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    if (last) return toCoords(last);
  } catch {
    /* ignore */
  }
  Alert.alert(
    "Couldn't get your location",
    "Make sure Location Services are on, then try again. If you're indoors, moving near a window can help.",
  );
  return null;
}
