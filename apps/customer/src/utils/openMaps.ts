import { Linking, Platform } from "react-native";

/** Opens Apple Maps / Google Maps (or web) for the given coordinate + label. */
export function openBranchInMaps(latitude: number, longitude: number, label: string): void {
  const q = encodeURIComponent(label);
  if (Platform.OS === "web") {
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
    return;
  }
  const url =
    Platform.OS === "ios"
      ? `maps://?q=${q}&ll=${latitude},${longitude}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${q})`;
  void Linking.openURL(url);
}
