import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { InAppNotificationBannerHost } from "./src/components/InAppNotificationBanner";
import { CustomerProvider, useCustomer } from "./src/context/CustomerContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ensureNotificationsConfigured } from "./src/notificationsSetup";
import { theme } from "./src/theme";

function Gate() {
  const { authReady, token } = useCustomer();
  if (!authReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }
  if (!token) return <LoginScreen />;
  return <AppNavigator />;
}

export default function App() {
  useEffect(() => {
    void ensureNotificationsConfigured();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CustomerProvider>
          <StatusBar style="light" />
          <InAppNotificationBannerHost />
          <Gate />
        </CustomerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
