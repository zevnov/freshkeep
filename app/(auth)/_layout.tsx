import { useTheme } from "@/context/ThemeContext";
import { Stack } from "expo-router";

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: "600", color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="login" options={{ title: "Sign in" }} />
      <Stack.Screen name="signup" options={{ title: "Create account" }} />
    </Stack>
  );
}
