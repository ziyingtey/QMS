import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CustomerProvider, useCustomer } from "./src/context/CustomerContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { LoginScreen } from "./src/screens/LoginScreen";

function Gate() {
  const { token } = useCustomer();
  if (!token) return <LoginScreen />;
  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CustomerProvider>
          <StatusBar style="light" />
          <Gate />
        </CustomerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
