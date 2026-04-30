import type { ThemeColors } from "@/constants/theme";
import { radius } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { bandLabel } from "@/lib/spoil";
import type { FreshnessBand } from "@/types";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    text: {
      fontSize: 12,
      fontWeight: "600",
    },
  });
}

function bandAccent(colors: ThemeColors, band: FreshnessBand): string {
  switch (band) {
    case "fresh":
      return colors.fresh;
    case "soon":
      return colors.soon;
    case "today":
      return colors.today;
    case "overdue":
      return colors.overdue;
  }
}

export function BandBadge({ band }: { band: FreshnessBand }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = bandAccent(colors, band);

  return (
    <View style={[styles.wrap, { borderColor: accent }]}>
      <Text style={[styles.text, { color: accent }]}>{bandLabel(band)}</Text>
    </View>
  );
}
