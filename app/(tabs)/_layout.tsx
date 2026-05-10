import { FloatingTabBar } from "@/components/FloatingTabBar";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="household" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
