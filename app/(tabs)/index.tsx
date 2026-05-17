import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import {
  computeFreshnessBand,
  daysUntilSpoil,
  formatSpoilDate,
  sortItemsByUrgency,
  toLocalDateString,
} from "@/lib/spoil";
import type { FreshnessBand, ItemRow, ItemScope } from "@/types";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Filter = "all" | ItemScope;

const BAND_LABEL: Record<FreshnessBand, string> = {
  fresh: "Fresh ✓",
  soon: "Use soon",
  today: "Today!",
  overdue: "Overdue",
};

function BigNumber({
  n,
  sub,
  color,
}: {
  n: number;
  sub: string;
  color: string;
}) {
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text
        style={{
          fontSize: 52,
          fontWeight: "700",
          lineHeight: 50,
          letterSpacing: -2,
          color,
        }}
      >
        {n}
      </Text>
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color,
          opacity: 0.52,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginTop: 4,
        }}
      >
        {sub}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { colors } = useTheme();
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
  const displayName = profile?.display_name ?? "there";

  const activeItems = useMemo(
    () => items.filter((i) => i.status === "active"),
    [items]
  );

  const filtered = useMemo(() => {
    const scoped =
      filter === "all"
        ? activeItems
        : activeItems.filter((i) => i.scope === filter);
    return sortItemsByUrgency(scoped, soonDays);
  }, [activeItems, filter, soonDays]);

  const counts = useMemo(() => {
    const fresh = activeItems.filter(
      (i) => computeFreshnessBand(i.spoil_on, soonDays, todayYmd) === "fresh"
    ).length;
    const soon = activeItems.filter((i) => {
      const b = computeFreshnessBand(i.spoil_on, soonDays, todayYmd);
      return b === "soon" || b === "today";
    }).length;
    const overdue = activeItems.filter(
      (i) => computeFreshnessBand(i.spoil_on, soonDays, todayYmd) === "overdue"
    ).length;
    return { fresh, soon, overdue };
  }, [activeItems, soonDays, todayYmd]);

  if (!configured) return <Redirect href="/setup" />;
  if (!user) return <Redirect href="/(auth)/login" />;

  const hero = filtered[0] ?? null;

  const renderHero = () => {
    if (!hero) return null;
    const band = computeFreshnessBand(hero.spoil_on, soonDays, todayYmd);
    const days = daysUntilSpoil(hero.spoil_on, todayYmd);
    const bg = colors.bandBg[band];
    const tx = colors.bandText[band];
    return (
      <Pressable
        onPress={() =>
          router.push({ pathname: "/item/[id]", params: { id: hero.id } })
        }
        style={[styles.heroCard, { backgroundColor: bg }]}
      >
        {/* Sticker pill */}
        <View
          style={[
            styles.stickerPill,
            {
              backgroundColor: "rgba(0,0,0,0.09)",
              transform: [{ rotate: "-2.5deg" }],
            },
          ]}
        >
          <Text style={[styles.stickerText, { color: tx }]}>
            Eat me first →
          </Text>
        </View>

        <View style={styles.heroBody}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: tx }]}>{hero.name}</Text>
            <Text style={[styles.heroMeta, { color: tx }]}>
              {hero.storage} · {formatSpoilDate(hero.spoil_on)}
            </Text>
          </View>
          <BigNumber
            n={Math.abs(days)}
            sub={days < 0 ? "days over" : "days left"}
            color={tx}
          />
        </View>

        {/* Deco star */}
        <Text
          style={[
            styles.decoStar,
            { color: "rgba(0,0,0,0.07)", transform: [{ rotate: "12deg" }] },
          ]}
        >
          ✦
        </Text>
      </Pressable>
    );
  };

  const renderItem = ({ item }: { item: ItemRow }) => {
    const band = computeFreshnessBand(item.spoil_on, soonDays, todayYmd);
    const days = daysUntilSpoil(item.spoil_on, todayYmd);
    const bg = colors.bandBg[band];
    const tx = colors.bandText[band];
    return (
      <Pressable
        onPress={() =>
          router.push({ pathname: "/item/[id]", params: { id: item.id } })
        }
        style={[styles.itemCard, { backgroundColor: bg }]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: tx,
              opacity: 0.55,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 4,
            }}
          >
            {BAND_LABEL[band]}
          </Text>
          <Text style={[styles.itemName, { color: tx }]}>{item.name}</Text>
          <Text style={[styles.itemMeta, { color: tx }]}>
            {item.storage} · {item.scope === "ours" ? "Ours" : "My"}
          </Text>
        </View>
        <BigNumber
          n={Math.abs(days)}
          sub={days < 0 ? "over" : "left"}
          color={tx}
        />
      </Pressable>
    );
  };

  const listHeader = (
    <>
      {/* Page header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>
            Hello, {displayName} 👋
          </Text>
          <EditorialHeading
            bold="What's"
            italic="fresh?"
            size={28}
            color={colors.text}
          />
        </View>
        <Text style={{ fontSize: 18, opacity: 0.5 }}>✦</Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {(
          [
            { band: "fresh" as const, label: "fresh" },
            { band: "soon" as const, label: "use soon" },
            { band: "overdue" as const, label: "overdue" },
          ] as const
        ).map(({ band, label }) => (
          <View
            key={band}
            style={[
              styles.statCard,
              { backgroundColor: colors.bandBg[band] },
            ]}
          >
            <Text
              style={{
                fontSize: 30,
                fontWeight: "700",
                lineHeight: 30,
                letterSpacing: -1,
                color: colors.bandText[band],
              }}
            >
              {counts[band === "fresh" ? "fresh" : band === "soon" ? "soon" : "overdue"]}
            </Text>
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: colors.bandText[band],
                opacity: 0.7,
                textTransform: "uppercase",
                letterSpacing: 0.7,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Hero card */}
      {renderHero()}

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {(["all", "ours", "mine"] as const).map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.brand : colors.faint,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: active ? "#fff" : colors.textMuted,
                }}
              >
                {key === "all" ? "All" : key === "ours" ? "Ours" : "My"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <ScrollView
          contentContainerStyle={[
            styles.center,
            { paddingBottom: insets.bottom + 120 },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {error}
          </Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.brand }]}
            onPress={() => void refresh()}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void refresh()}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.md,
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + 120,
            gap: spacing.sm,
          }}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={{ marginBottom: spacing.sm }}
          ListEmptyComponent={
            <Text
              style={[styles.empty, { color: colors.textMuted }]}
            >
              Nothing here yet — add something with the + button.
            </Text>
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  greeting: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    gap: 3,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 20,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  heroBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginTop: 12,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroMeta: {
    fontSize: 13,
    opacity: 0.6,
  },
  decoStar: {
    position: "absolute",
    bottom: -8,
    right: 14,
    fontSize: 44,
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
  chipRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: 17,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  itemCard: {
    borderRadius: 20,
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 3,
  },
  itemMeta: {
    fontSize: 12,
    opacity: 0.55,
  },
  empty: {
    textAlign: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
  },
  errorText: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
});
