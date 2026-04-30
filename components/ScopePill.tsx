import { radius } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import type { ItemScope } from "@/types";
import { StyleSheet, Text, View } from "react-native";

const layout = StyleSheet.create({
  wrap: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
});

export function ScopePill({ scope }: { scope: ItemScope }) {
  const { colors } = useTheme();
  const ours = scope === "ours";
  return (
    <View style={[layout.wrap, { backgroundColor: ours ? colors.oursBg : colors.mineBg }]}>
      <Text style={[layout.text, { color: ours ? colors.ours : colors.mine }]}>{ours ? "Ours" : "My"}</Text>
    </View>
  );
}
