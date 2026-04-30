import { BandBadge } from "@/components/BandBadge";
import { ScopePill } from "@/components/ScopePill";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import {
  computeFreshnessBand,
  daysUntilSpoil,
  formatSpoilDate,
  statusLabel,
  toLocalDateString,
} from "@/lib/spoil";
import { router, useLocalSearchParams, Redirect } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
    missing: { fontSize: 16, color: colors.textMuted, textAlign: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
    title: { flex: 1, fontSize: 24, fontWeight: "700", color: colors.text },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    privacy: { fontSize: 13, color: colors.textMuted },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    rowItem: { gap: 4 },
    rowLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
    rowValue: { fontSize: 16, color: colors.text },
    actions: { gap: spacing.sm, marginTop: spacing.md },
    primaryBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
    },
    primaryBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
    secondaryBtn: {
      backgroundColor: colors.surface,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    dangerBtn: {
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
    },
    dangerBtnText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
  });
}

export default function ItemDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { items, updateItem, loading } = useItems();

  const item = items.find((i) => i.id === id);

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.rowItem}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!loading && !item) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>This item is gone or you don’t have access.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const detailItem = item;
  const soonDays = profile?.notification_prefs.defaultSoonDays ?? 3;
  const todayYmd = toLocalDateString(new Date());
  const band = computeFreshnessBand(detailItem.spoil_on, soonDays, todayYmd);
  const days = daysUntilSpoil(detailItem.spoil_on, todayYmd);

  async function mark(status: "consumed" | "trashed") {
    const itemId = detailItem.id;
    const label = status === "consumed" ? "Mark as used?" : "Discard this item?";
    Alert.alert(label, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: status === "consumed" ? "Used" : "Discard",
        style: status === "consumed" ? "default" : "destructive",
        onPress: () => {
          void (async () => {
            const { error } = await updateItem(itemId, { status });
            if (error) Alert.alert("Could not update", error.message);
            else router.back();
          })();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{item.name}</Text>
        <BandBadge band={band} />
      </View>

      <View style={styles.row}>
        <ScopePill scope={item.scope} />
        {item.scope === "mine" ? <Text style={styles.privacy}>Only visible to you</Text> : null}
      </View>

      <View style={styles.card}>
        <Row label="Storage" value={item.storage.charAt(0).toUpperCase() + item.storage.slice(1)} />
        <Row
          label="Spoil"
          value={`${formatSpoilDate(item.spoil_on)} (${days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d left`})`}
        />
        <Row label="Status" value={statusLabel(item.status)} />
        {item.quantity != null ? (
          <Row label="Quantity" value={`${item.quantity}${item.unit ? ` ${item.unit}` : ""}`} />
        ) : null}
        <Row label="Reminders" value={item.remind_me ? "On" : "Off"} />
        {item.remind_me ? (
          <Row
            label="Soon window"
            value={item.remind_days_before > 0 ? `${item.remind_days_before}d before` : "Default from settings"}
          />
        ) : null}
        {item.notes ? <Row label="Notes" value={item.notes} /> : null}
      </View>

      {item.status === "active" ? (
        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={() => router.push({ pathname: "/add-item", params: { id: item.id } })}>
            <Text style={styles.primaryBtnText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void mark("consumed")}>
            <Text style={styles.secondaryBtnText}>Mark as used</Text>
          </Pressable>
          <Pressable style={styles.dangerBtn} onPress={() => void mark("trashed")}>
            <Text style={styles.dangerBtnText}>Discard</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
