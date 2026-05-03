import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { useMemo } from "react";
import { StyleSheet } from "react-native";

export function createAddItemStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    notFound: { fontSize: 16, color: colors.textMuted, textAlign: "center" },
    notFoundBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      backgroundColor: colors.brandBtn,
      borderRadius: radius.md,
    },
    notFoundBtnText: { color: "#fff", fontWeight: "700" },
    // Section cards
    nameCard: {
      backgroundColor: colors.isDark ? "#150E28" : "#D8CCFF",
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    spoilCard: {
      backgroundColor: colors.isDark ? "#220E00" : "#FFD0B0",
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    surfaceCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    sectionLabel: {
      fontSize: 10.5,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
    },
    label: { fontSize: 10.5, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
    hint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    muted: { fontSize: 13, color: colors.brand, fontWeight: "600", marginTop: 4 },
    input: {
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: "rgba(255,255,255,0.42)",
      marginTop: 4,
    },
    inputDark: {
      backgroundColor: "rgba(255,255,255,0.07)",
    },
    notes: { minHeight: 80, textAlignVertical: "top" },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
    chip: {
      paddingHorizontal: 17,
      paddingVertical: 7,
      borderRadius: radius.pill,
      backgroundColor: colors.faint,
    },
    chipOn: { backgroundColor: colors.brandBtn },
    chipText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
    chipTextOn: { color: "#fff" },
    doneIOS: {
      alignSelf: "flex-start",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      backgroundColor: colors.brandBtn,
      borderRadius: radius.md,
    },
    doneIOSText: { color: "#fff", fontWeight: "700" },
    scanBtn: {
      marginTop: spacing.sm,
      backgroundColor: "rgba(255,255,255,0.32)",
      borderRadius: radius.sm,
      paddingVertical: 9,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    scanBtnText: { color: "#1A1817", fontWeight: "600", fontSize: 13 },
  });
}

export function useAddItemStyles() {
  const { colors } = useTheme();
  return useMemo(() => createAddItemStyles(colors), [colors]);
}
