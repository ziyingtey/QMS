import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable } from "react-native";
import { BookingBranchesScreen } from "../screens/BookingBranchesScreen";
import { BookingServicesScreen } from "../screens/BookingServicesScreen";
import { BookingSlotsScreen } from "../screens/BookingSlotsScreen";
import { BookingTicketScreen } from "../screens/BookingTicketScreen";
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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          paddingTop: 6,
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarButton: (props) => {
          const { children, onPress, accessibilityState } = props;
          const selected = accessibilityState?.selected;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              onPress={onPress}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                marginHorizontal: 4,
                marginVertical: 6,
                borderRadius: 14,
                backgroundColor: selected ? theme.primary : "transparent",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {children}
            </Pressable>
          );
        },
        tabBarIcon: ({ color, size }) => {
          const map: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: "home-outline",
            Booking: "calendar-outline",
            Queue: "ticket-outline",
            Profile: "person-outline",
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
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

export function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={MainTabs} />
        <RootStack.Screen name="MapBranches" component={MapBranchesScreen} options={{ presentation: "modal" }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
