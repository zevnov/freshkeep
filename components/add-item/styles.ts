import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { useMemo } from "react";
import { StyleSheet } from "react-native";

export function createAddItemStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.xs },
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
      backgroundColor: colors.primary,
      borderRadius: radius.md,
    },
    notFoundBtnText: { color: colors.onPrimary, fontWeight: "700" },
    label: { marginTop: spacing.md, fontSize: 14, fontWeight: "600", color: colors.textMuted },
    hint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    muted: { fontSize: 13, color: colors.primary, fontWeight: "600", marginTop: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      marginTop: 4,
    },
    notes: { minHeight: 80, textAlignVertical: "top" },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
    chipText: { color: colors.textMuted, fontWeight: "600" },
    chipTextOn: { color: colors.primary },
    doneIOS: {
      alignSelf: "flex-start",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
    },
    doneIOSText: { color: colors.onPrimary, fontWeight: "700" },
    scanBtn: {
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: "center",
    },
    scanBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  });
}

export function useAddItemStyles() {
  const { colors } = useTheme();
  return useMemo(() => createAddItemStyles(colors), [colors]);
}
