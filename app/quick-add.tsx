import { radius, spacing } from "@/constants/theme";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import type { BarcodeLookupResult } from "@/lib/barcodeLookup";
import { suggestIcon } from "@/lib/foodIcons";
import { stashProduct } from "@/lib/productHandoff";
import { MIN_SEARCH_LENGTH, recentProducts, searchProducts } from "@/lib/productSearch";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const DEBOUNCE_MS = 450;

export default function QuickAddScreen() {
  const { colors } = useTheme();
  const { items } = useItems();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BarcodeLookupResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestQueryRef = useRef("");

  const recents = useMemo(() => recentProducts(items), [items]);
  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    latestQueryRef.current = trimmed;
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void searchProducts(trimmed).then((res) => {
        // Drop answers to queries the user has already typed past.
        if (latestQueryRef.current !== trimmed) return;
        setResults(res.products);
        setError(res.error);
        setSearching(false);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const pick = useCallback(
    (product: BarcodeLookupResult) => {
      const params = { product_token: stashProduct(product), scan_at: String(Date.now()) };
      // Opened from the add-item form: go back to it. Opened from home: open the form in its place.
      if (from === "home") router.replace({ pathname: "/add-item", params });
      else router.dismissTo({ pathname: "/add-item", params });
    },
    [from]
  );

  const renderRow = useCallback(
    ({ item }: { item: BarcodeLookupResult }) => {
      const meta = [item.brand, item.nutrition?.kcal != null ? `${item.nutrition.kcal} kcal` : null]
        .filter(Boolean)
        .join(" · ");
      return (
        <Pressable
          style={[styles.row, { backgroundColor: colors.surface }]}
          onPress={() => pick(item)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name}${item.brand ? ` by ${item.brand}` : ""}`}
        >
          <View style={[styles.thumb, { backgroundColor: colors.faint }]}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.thumbImage} resizeMode="contain" />
            ) : (
              <Text style={{ fontSize: 22 }}>{suggestIcon(item.name ?? "")}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {meta ? (
              <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>+ Add</Text>
        </Pressable>
      );
    },
    [colors, pick]
  );

  const data = isSearching ? results : recents;
  const sectionLabel = isSearching ? "Popular matches" : recents.length > 0 ? "Added before" : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.searchBar, { backgroundColor: colors.faint }]}>
        <Text style={{ fontSize: 15, opacity: 0.5, color: colors.textMuted }}>⌕</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search a brand or product…"
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search brands and products"
        />
        {searching ? <ActivityIndicator color={colors.brand} /> : null}
      </View>

      <FlatList
        data={data}
        keyExtractor={(p) => p.barcode}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 }}
        ListHeaderComponent={
          sectionLabel ? <Text style={[styles.section, { color: colors.textMuted }]}>{sectionLabel}</Text> : null
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: error ? colors.danger : colors.textMuted }]}>
            {error
              ? error
              : isSearching
              ? searching
                ? "Searching…"
                : `No products match "${trimmed}".`
              : "Type a brand or product, like \"Chobani\" or \"oat milk\". Products you add with a barcode show up here for one-tap re-adding."}
          </Text>
        }
      />
      <Text style={[styles.credit, { color: colors.textMuted }]}>Product data from Open Food Facts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  section: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 10 },
  thumb: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImage: { width: "100%", height: "100%" },
  rowName: { fontSize: 15, fontWeight: "600" },
  rowMeta: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", marginTop: spacing.xl, paddingHorizontal: spacing.lg, fontSize: 14, lineHeight: 20 },
  credit: { textAlign: "center", fontSize: 11, paddingBottom: spacing.lg },
});
