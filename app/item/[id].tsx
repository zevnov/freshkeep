import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import {
  computeFreshnessBand,
  daysUntilSpoil,
  formatSpoilDate,
  statusLabel,
  toLocalDateString,
} from "@/lib/spoil";
import type { FreshnessBand } from "@/types";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HERO_LABEL: Record<FreshnessBand, string> = {
  fresh: "Lookin' good ✓",
  soon: "Use me soon",
  today: "Use today!",
  overdue: "Past date",
};

const PILL_ROTATE: Record<FreshnessBand, string> = {
  fresh: "-2.5deg",
  soon: "-1.5deg",
  today: "2deg",
  overdue: "-3deg",
};

export default function ItemDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { items, updateItem, loading } = useItems();

  const item = items.find((i) => i.id === id);
  const versionRef = useRef(item?.schedule_version ?? 0);
  versionRef.current = item?.schedule_version ?? 0;

  if (!user) return <Redirect href="/(auth)/login" />;

  if (!loading && !item) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.bg, paddingTop: insets.top },
        ]}
      >
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>
          This item is gone or you don&apos;t have access.
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.brandBtn }]}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!item) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.bg, paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const soonDays = profile?.notification_prefs.defaultSoonDays ?? 3;
  const todayYmd = toLocalDateString(new Date());
  const band = computeFreshnessBand(item.spoil_on, soonDays, todayYmd);
  const days = daysUntilSpoil(item.spoil_on, todayYmd);
  const heroBg = colors.bandBg[band];
  const heroTx = colors.bandText[band];

  async function mark(status: "consumed" | "trashed") {
    const itemId = item!.id;
    const label = status === "consumed" ? "Mark as used?" : "Discard this item?";

    const applyStatus = async (expectedVersion?: number): Promise<Error | null> => {
      try {
        const { error } = await updateItem(itemId, { status }, expectedVersion);
        return error;
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(label);
      if (!confirmed) return;
      const error = await applyStatus(versionRef.current);
      if (error) window.alert("Could not update: " + error.message);
      else router.back();
      return;
    }

    Alert.alert(label, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: status === "consumed" ? "Used" : "Discard",
        style: status === "consumed" ? "default" : "destructive",
        onPress: () => {
          void (async () => {
            const error = await applyStatus(versionRef.current);
            if (error) Alert.alert("Could not update", error.message);
            else router.back();
          })();
        },
      },
    ]);
  }

  const spoilLabel =
    days < 0
      ? `${Math.abs(days)}d overdue`
      : days === 0
      ? "today"
      : `${days}d left`;

  const rows: [string, string][] = [
    ["Storage", item.storage.charAt(0).toUpperCase() + item.storage.slice(1)],
    ["Spoil date", `${formatSpoilDate(item.spoil_on)} (${spoilLabel})`],
    ["Status", statusLabel(item.status)],
    ...(item.quantity != null
      ? ([["Quantity", `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`]] as [string, string][])
      : []),
    ["Reminders", item.remind_me ? "On" : "Off"],
    ...(item.remind_me && item.remind_days_before > 0
      ? ([["Soon window", `${item.remind_days_before}d before`]] as [string, string][])
      : []),
    ...(item.notes ? ([["Notes", item.notes]] as [string, string][]) : []),
  ];

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + 120 },
      ]}
    >
      {/* Back button */}
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: colors.text }]}>‹ Back</Text>
      </Pressable>

      {/* Hero pastel card */}
      <View style={[styles.heroCard, { backgroundColor: heroBg }]}>
        {/* Sticker pill */}
        <View
          style={[
            styles.stickerPill,
            {
              backgroundColor: "rgba(0,0,0,0.09)",
              transform: [{ rotate: PILL_ROTATE[band] }],
              marginBottom: 14,
            },
          ]}
        >
          <Text style={[styles.stickerText, { color: heroTx }]}>
            {HERO_LABEL[band]}
          </Text>
        </View>

        <Text style={[styles.heroName, { color: heroTx }]}>{item.name}</Text>

        {/* Big countdown */}
        <View style={styles.heroCountRow}>
          <View>
            <Text style={[styles.bigNum, { color: heroTx }]}>
              {Math.abs(days)}
            </Text>
            <Text style={[styles.bigSub, { color: heroTx }]}>
              {days < 0 ? "days overdue" : "days left"}
            </Text>
          </View>
        </View>

        {/* Deco */}
        <Text
          style={[
            styles.decoStar,
            { color: "rgba(0,0,0,0.06)", transform: [{ rotate: "18deg" }] },
          ]}
        >
          ✦
        </Text>
      </View>

      {/* Detail rows card */}
      <View style={[styles.detailCard, { backgroundColor: colors.surface }]}>
        {rows.map(([label, value], i) => (
          <View
            key={label}
            style={[
              styles.detailRow,
              i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.sep },
            ]}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 3,
              }}
            >
              {label}
            </Text>
            <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {item.status === "active" ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.brandBtn }]}
            onPress={() =>
              router.push({ pathname: "/add-item", params: { id: item.id } })
            }
          >
            <Text style={styles.primaryBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, { backgroundColor: colors.faint }]}
            onPress={() => void mark("consumed")}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
              Mark as used ✓
            </Text>
          </Pressable>
          <Pressable
            style={[styles.dangerBtn, { backgroundColor: colors.faint }]}
            onPress={() => void mark("trashed")}
          >
            <Text style={[styles.dangerBtnText, { color: colors.danger }]}>
              Discard
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.md, gap: spacing.md },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  backBtn: { paddingVertical: 4, marginBottom: 4 },
  backText: { fontSize: 16, fontWeight: "500" },
  heroCard: {
    borderRadius: radius.xl,
    padding: 22,
    overflow: "hidden",
  },
  stickerPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  stickerText: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  heroName: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 27,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  heroCountRow: {
    flexDirection: "row",
  },
  bigNum: {
    fontSize: 58,
    fontWeight: "700",
    lineHeight: 55,
    letterSpacing: -3,
  },
  bigSub: {
    fontSize: 9,
    fontWeight: "700",
    opacity: 0.52,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 5,
  },
  decoStar: {
    position: "absolute",
    bottom: -10,
    right: 14,
    fontSize: 52,
  },
  detailCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  detailRow: {
    padding: spacing.md,
  },
  actions: { gap: spacing.sm, marginTop: 4 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  secondaryBtnText: { fontWeight: "600", fontSize: 16 },
  dangerBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  dangerBtnText: { fontWeight: "700", fontSize: 15 },
});
