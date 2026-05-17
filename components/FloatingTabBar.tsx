import { useTheme } from "@/context/ThemeContext";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function HomeIcon({ color, size }: { color: string; size: number }) {
  return (
    <Text style={{ fontSize: size, color, lineHeight: size + 2 }}>🏠</Text>
  );
}
function HouseholdIcon({ color, size }: { color: string; size: number }) {
  return (
    <Text style={{ fontSize: size, color, lineHeight: size + 2 }}>👪</Text>
  );
}
function SettingsIcon({ color, size }: { color: string; size: number }) {
  return (
    <Text style={{ fontSize: size, color, lineHeight: size + 2 }}>⚙️</Text>
  );
}

const ICON_MAP: Record<
  string,
  React.FC<{ color: string; size: number }>
> = {
  index: HomeIcon,
  household: HouseholdIcon,
  settings: SettingsIcon,
};

const LABEL_MAP: Record<string, string> = {
  index: "Home",
  household: "Household",
  settings: "Settings",
};

export function FloatingTabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const { isDark: dark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const bg = dark ? "#1F1F1C" : "#FFFFFF";
  const activeColor = dark ? "#9FD89A" : "#1A4214";
  const inactiveColor = dark ? "#555550" : "#BBBBBB";

  const bottom = Math.max(insets.bottom, 8) + 8;

  return (
    <View
      style={[
        styles.wrapper,
        {
          bottom,
          backgroundColor: bg,
          shadowColor: "#000",
        },
      ]}
    >
      {/* Left two tabs: Home, Household */}
      {state.routes.slice(0, 2).map((route, idx) => {
        const isFocused = state.index === idx;
        const Icon = ICON_MAP[route.name];
        const label = LABEL_MAP[route.name] ?? route.name;
        const color = isFocused ? activeColor : inactiveColor;

        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={styles.tabBtn}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            {Icon && <Icon color={color} size={20} />}
            <Text
              style={{
                fontSize: 9,
                fontWeight: isFocused ? "700" : "500",
                color,
                marginTop: 2,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}

      {/* Center FAB */}
      <Pressable
        onPress={() => router.push("/add-item")}
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Add item"
      >
        <Text style={{ fontSize: 26, color: "#1A1800", lineHeight: 28 }}>
          +
        </Text>
      </Pressable>

      {/* Right tab: Settings */}
      {state.routes.slice(2).map((route, idx) => {
        const routeIdx = idx + 2;
        const isFocused = state.index === routeIdx;
        const Icon = ICON_MAP[route.name];
        const label = LABEL_MAP[route.name] ?? route.name;
        const color = isFocused ? activeColor : inactiveColor;

        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={styles.tabBtn}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            {Icon && <Icon color={color} size={20} />}
            <Text
              style={{
                fontSize: 9,
                fontWeight: isFocused ? "700" : "500",
                color,
                marginTop: 2,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    // Shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 2,
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFE07A",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    flexShrink: 0,
  },
});
