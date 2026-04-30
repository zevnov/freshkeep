import { useTheme } from "@/context/ThemeContext";
import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: "600", color: colors.text },
        headerTintColor: colors.primary,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Freshkeep",
          tabBarLabel: "Home",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🥬</Text>,
        }}
      />
      <Tabs.Screen
        name="household"
        options={{
          title: "Household",
          tabBarLabel: "Household",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👪</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
