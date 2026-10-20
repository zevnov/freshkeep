import { radius, spacing } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { DEFAULT_ICON } from "@/lib/foodIcons";
import type { ItemNutrition } from "@/types";
import { Image, StyleSheet, Text, View } from "react-native";

type Props = {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  nutrition: ItemNutrition | null;
  storageTip?: string | null;
  /** Shown in the image slot when there is no product photo. */
  fallbackIcon?: string;
};

function grams(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}g`;
}

function basisLabel(nutrition: ItemNutrition): string {
  if (nutrition.basis === "serving") return nutrition.serving_size ? `per serving (${nutrition.serving_size})` : "per serving";
  return "per 100 g";
}

/** Scanned-product card: photo on the left, name and kcal on the right, macro pills underneath. */
export function ProductCard({ name, brand, imageUrl, nutrition, storageTip, fallbackIcon }: Props) {
  const { colors } = useTheme();
  const macros: { label: string; value: number | null; bg: string; fg: string }[] = nutrition
    ? [
        { label: "protein", value: nutrition.protein_g, bg: colors.bandBg.fresh, fg: colors.bandText.fresh },
        { label: "carb", value: nutrition.carbs_g, bg: colors.bandBg.soon, fg: colors.bandText.soon },
        { label: "fat", value: nutrition.fat_g, bg: colors.bandBg.today, fg: colors.bandText.today },
      ]
    : [];
  const shownMacros = macros.filter((m) => m.value != null);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.imageBox, { backgroundColor: colors.faint }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={name ? `Photo of ${name}` : "Product photo"}
            />
          ) : (
            <Text style={styles.fallbackIcon}>{fallbackIcon ?? DEFAULT_ICON}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {name ?? "Product not found"}
          </Text>
          {brand ? (
            <Text style={[styles.brand, { color: colors.textMuted }]} numberOfLines={1}>
              {brand}
            </Text>
          ) : null}
          {nutrition?.kcal != null ? (
            <View style={styles.kcalRow}>
              <Text style={[styles.kcal, { color: colors.text }]}>{nutrition.kcal}</Text>
              <Text style={[styles.kcalUnit, { color: colors.textMuted }]}> kcal</Text>
            </View>
          ) : null}
          {nutrition ? (
            <Text style={[styles.basis, { color: colors.textMuted }]} numberOfLines={1}>
              {basisLabel(nutrition)}
            </Text>
          ) : null}
        </View>
      </View>

      {shownMacros.length > 0 ? (
        <View style={styles.pills}>
          {shownMacros.map((m) => (
            <View key={m.label} style={[styles.pill, { backgroundColor: m.bg }]}>
              <Text style={[styles.pillText, { color: m.fg }]}>
                {grams(m.value as number)} {m.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {storageTip ? (
        <View style={[styles.tip, { backgroundColor: colors.faint }]}>
          <Text style={[styles.tipLabel, { color: colors.textMuted }]}>Storage · from the manufacturer</Text>
          <Text style={[styles.tipText, { color: colors.text }]}>{storageTip}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm + 4 },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  imageBox: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  fallbackIcon: { fontSize: 38 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: "700", lineHeight: 22 },
  brand: { fontSize: 13 },
  kcalRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  kcal: { fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  kcalUnit: { fontSize: 13, fontWeight: "600" },
  basis: { fontSize: 11 },
  pills: { flexDirection: "row", gap: spacing.sm },
  pill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 13, fontWeight: "700" },
  tip: { borderRadius: radius.sm, padding: spacing.sm + 4, gap: 2 },
  tipLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  tipText: { fontSize: 14, lineHeight: 20 },
});
