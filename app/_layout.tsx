import "react-native-gesture-handler";

import { AuthProvider } from "@/context/AuthContext";
import { ItemsProvider } from "@/context/ItemsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { registerBackgroundNotificationTaskAsync } from "@/lib/backgroundNotifications";
import { ensureNotificationChannel } from "@/lib/notifications";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: Boolean(sentryDsn),
  debug: __DEV__,
  environment: __DEV__ ? "development" : "production",
  release: Constants.expoConfig?.version ? `freshkeep@${Constants.expoConfig.version}` : undefined,
  tracesSampleRate: 1.0,
});

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
        <Stack.Screen name="bulk-scan" options={{ title: "Bulk scanner", presentation: "fullScreenModal" }} />
        <Stack.Screen name="receipt-scan" options={{ title: "Receipt scanner", presentation: "fullScreenModal" }} />
        <Stack.Screen name="join-household" options={{ title: "Join household", presentation: "modal" }} />
        <Stack.Screen name="item/[id]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  useEffect(() => {
    ensureNotificationChannel().catch((err) => Sentry.captureException(err));
    registerBackgroundNotificationTaskAsync().catch((err) => Sentry.captureException(err));
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ItemsProvider>
            <RootStack />
          </ItemsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
