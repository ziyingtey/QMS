import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookingBranchesScreen } from "../screens/BookingBranchesScreen";
import { BookingServicesScreen } from "../screens/BookingServicesScreen";
import { BookingSlotsScreen } from "../screens/BookingSlotsScreen";
import { BookingTicketScreen } from "../screens/BookingTicketScreen";
import { BranchDetailScreen } from "../screens/BranchDetailScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MapBranchesScreen } from "../screens/MapBranchesScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { QueueHomeScreen } from "../screens/QueueHomeScreen";
import { QueueTrackScreen } from "../screens/QueueTrackScreen";
import { theme } from "../theme";
import type { BookingStackParamList, MainTabParamList, QueueStackParamList, RootStackParamList } from "./navigationRef";
import { navigationRef } from "./navigationRef";

const Tab = createBottomTabNavigator<MainTabParamList>();
const BookingStackNav = createNativeStackNavigator<BookingStackParamList>();
const QueueStackNav = createNativeStackNavigator<QueueStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function BookingNavigator() {
  return (
    <BookingStackNav.Navigator screenOptions={{ headerShown: false }}>
      <BookingStackNav.Screen name="BookingBranches" component={BookingBranchesScreen} />
      <BookingStackNav.Screen name="BookingServices" component={BookingServicesScreen} />
      <BookingStackNav.Screen name="BookingSlots" component={BookingSlotsScreen} />
      <BookingStackNav.Screen name="BookingTicket" component={BookingTicketScreen} />
    </BookingStackNav.Navigator>
  );
}

function QueueNavigator() {
  return (
    <QueueStackNav.Navigator screenOptions={{ headerShown: false }}>
      <QueueStackNav.Screen name="QueueHome" component={QueueHomeScreen} />
      <QueueStackNav.Screen name="QueueTrack" component={QueueTrackScreen} />
    </QueueStackNav.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const tabBarBottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 52 + tabBarBottomPad;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: "rgba(255,255,255,0.12)",
          paddingTop: 6,
          paddingBottom: tabBarBottomPad,
          height: tabBarHeight,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
        tabBarIconStyle: { marginTop: 4 },
        // Merge RN's tab item `style` (flex column for icon + label); omitting it hid labels.
        tabBarButton: (props) => {
          const { children, onPress, onLongPress, accessibilityRole, accessibilityState, testID, style } = props;
          return (
            <Pressable
              accessibilityRole={accessibilityRole}
              accessibilityState={accessibilityState}
              testID={testID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={(state) => [
                style,
                styles.tabPressable,
                state.pressed && { opacity: 0.88 },
              ]}
            >
              {children}
            </Pressable>
          );
        },
        tabBarIcon: ({ color, size, focused }) => {
          const map: Record<keyof MainTabParamList, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
            Home: ["home", "home-outline"],
            Booking: ["calendar", "calendar-outline"],
            Queue: ["ticket", "ticket-outline"],
            Profile: ["person", "person-outline"],
          };
          const [on, off] = map[route.name];
          return <Ionicons name={focused ? on : off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Booking" component={BookingNavigator} options={{ tabBarLabel: "Booking" }} />
      <Tab.Screen name="Queue" component={QueueNavigator} options={{ tabBarLabel: "Queue" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 12,
  },
});

export function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ contentStyle: { backgroundColor: theme.headerNavy } }}
        />
        <RootStack.Screen name="MapBranches" component={MapBranchesScreen} options={{ presentation: "modal" }} />
        <RootStack.Screen name="BranchDetail" component={BranchDetailScreen} options={{ presentation: "card" }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
