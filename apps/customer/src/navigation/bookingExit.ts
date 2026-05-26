import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BookingReturnTo, BookingStackParamList } from "./navigationRef";

/** Leave booking stack: branches list, or Home (and reset booking stack to Branches). */
export function exitBookingFlow(
  navigation: NativeStackNavigationProp<BookingStackParamList>,
  returnTo?: BookingReturnTo,
) {
  if (returnTo === "home") {
    navigation.reset({ index: 0, routes: [{ name: "BookingBranches" }] });
    navigation.getParent()?.navigate("Home");
    return;
  }
  navigation.navigate("BookingBranches");
}
