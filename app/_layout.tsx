import "react-native-gesture-handler";

import { AuthProvider } from "@/context/AuthContext";
import { ItemsProvider } from "@/context/ItemsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ensureNotificationChannel } from "@/lib/notifications";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";

function RootStack() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: "600", color: colors.text },
          headerStyle: { backgroundColor: colors.surface },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: "Setup" }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-item" options={{ title: "Add item", presentation: "modal" }} />
        <Stack.Screen name="scan-barcode" options={{ title: "Scan barcode", presentation: "fullScreenModal" }} />
        <Stack.Screen name="join-household" options={{ title: "Join household", presentation: "modal" }} />
        <Stack.Screen name="item/[id]" options={{ title: "Item" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void ensureNotificationChannel();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ItemsProvider>
          <RootStack />
        </ItemsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
