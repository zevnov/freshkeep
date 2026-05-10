import { radius } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { bandLabel } from "@/lib/spoil";
import type { FreshnessBand } from "@/types";
import { StyleSheet, Text, View } from "react-native";

const ROTATIONS: Record<FreshnessBand, string> = {
  fresh: "-2.5deg",
  soon: "-1.5deg",
  today: "2deg",
  overdue: "-3deg",
};

export function BandBadge({ band }: { band: FreshnessBand }) {
  const { colors } = useTheme();
  const bg = colors.bandBg[band];
  const color = colors.bandText[band];
  const rotate = ROTATIONS[band];

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: bg, transform: [{ rotate }] },
      ]}
    >
      <Text style={[styles.text, { color }]}>{bandLabel(band)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
