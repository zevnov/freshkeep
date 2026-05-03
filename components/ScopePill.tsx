import { radius } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import type { ItemScope } from "@/types";
import { StyleSheet, Text, View } from "react-native";

export function ScopePill({ scope }: { scope: ItemScope }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.faint }]}>
      <Text style={[styles.text, { color: colors.textMuted }]}>
        {scope === "ours" ? "Ours" : "My"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
});
