import { BandBadge } from "@/components/BandBadge";
import { ScopePill } from "@/components/ScopePill";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { computeFreshnessBand, formatSpoilDate, sortItemsByUrgency, toLocalDateString } from "@/lib/spoil";
import type { ItemScope } from "@/types";
import { useFocusEffect, Redirect, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Filter = "all" | ItemScope;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    segment: {
      flexDirection: "row",
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: radius.sm,
    },
    segBtnActive: { backgroundColor: colors.primaryMuted },
    segText: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
    segTextActive: { color: colors.primary },
    listContent: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingTop: spacing.xs },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, alignItems: "flex-start" },
    cardTitle: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.text },
    cardMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    metaMuted: { fontSize: 13, color: colors.textMuted, flex: 1 },
    empty: { textAlign: "center", color: colors.textMuted, marginTop: spacing.xl, paddingHorizontal: spacing.lg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
    error: { color: colors.danger, textAlign: "center", marginBottom: spacing.md },
    retry: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md },
    retryText: { color: colors.onPrimary, fontWeight: "600" },
    fab: {
      position: "absolute",
      right: spacing.lg,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.shadow,
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    fabText: { color: colors.onPrimary, fontSize: 28, fontWeight: "300", marginTop: -2 },
  });
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { configured, user, profile } = useAuth();
  const { items, loading, error, refresh } = useItems();
  const [filter, setFilter] = useState<Filter>("all");
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const soonDays = profile?.notification_prefs.defaultSoonDays ?? 3;
  const todayYmd = toLocalDateString(new Date());

  const filtered = useMemo(() => {
    const active = items.filter((i) => i.status === "active");
    const scoped =
      filter === "all" ? active : active.filter((i) => i.scope === filter);
    return sortItemsByUrgency(scoped, soonDays);
  }, [items, filter, soonDays]);

  if (!configured) {
    return <Redirect href="/setup" />;
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.segment}>
        {(["all", "ours", "mine"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            style={[styles.segBtn, filter === key && styles.segBtnActive]}
          >
            <Text style={[styles.segText, filter === key && styles.segTextActive]}>
              {key === "all" ? "All" : key === "ours" ? "Ours" : "My"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void refresh()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          ListEmptyComponent={
            <Text style={styles.empty}>Nothing here yet. Add something from the + button.</Text>
          }
          renderItem={({ item }) => {
            const band = computeFreshnessBand(item.spoil_on, soonDays, todayYmd);
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push({ pathname: "/item/[id]", params: { id: item.id } })}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <BandBadge band={band} />
                </View>
                <View style={styles.cardMeta}>
                  <ScopePill scope={item.scope} />
                  <Text style={styles.metaMuted}>
                    {item.storage} · {formatSpoilDate(item.spoil_on)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + spacing.md }]}
        onPress={() => router.push("/add-item")}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </View>
  );
}
