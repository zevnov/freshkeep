import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { notifyUser, useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import { parseLocalDate, toLocalDateString } from "@/lib/spoil";
import {
  deleteBodyFat,
  fetchBodyFatEntries,
  fetchProfileDetails,
  logBodyFat,
  normalizeUsername,
  parseBodyFatPercent,
  saveProfileDetails,
  summarizeBodyFat,
  tenure,
  usernameError,
  type BodyFatEntry,
  type ProfileDetails,
} from "@/lib/userProfile";
import * as Sentry from "@sentry/react-native";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/** "Mar 3, 2026": readings and join dates span years, unlike spoil dates. */
function formatDay(ymd: string): string {
  return parseLocalDate(ymd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatChange(points: number | null): string | null {
  if (points == null) return null;
  if (points === 0) return "no change";
  return `${points > 0 ? "▲" : "▼"} ${Math.abs(points).toFixed(1)} pts`;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const { items } = useItems();
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [entries, setEntries] = useState<BodyFatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [bfInput, setBfInput] = useState("");
  const [savingBf, setSavingBf] = useState(false);

  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [p, bf] = await Promise.all([fetchProfileDetails(userId), fetchBodyFatEntries()]);
      if (p.data) {
        setDetails(p.data);
        setDisplayName(p.data.display_name ?? "");
        setUsername(p.data.username ?? "");
      }
      setEntries(bf.data);
      setLoadError(p.error ?? bf.error);
    } catch (err) {
      Sentry.captureException(err);
      setLoadError("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeBodyFat(entries), [entries]);
  const itemsAdded = useMemo(() => items.filter((i) => i.created_by === userId).length, [items, userId]);
  const normalizedUsername = normalizeUsername(username);
  const usernameProblem = usernameError(normalizedUsername);
  const profileDirty =
    details != null &&
    (displayName.trim() !== (details.display_name ?? "") || normalizedUsername !== (details.username ?? ""));

  async function onSaveProfile() {
    if (!userId || usernameProblem) return;
    setSavingProfile(true);
    const { error } = await saveProfileDetails(userId, {
      display_name: displayName.trim() || null,
      username: normalizedUsername || null,
    });
    setSavingProfile(false);
    if (error) {
      notifyUser("Could not save", error);
      return;
    }
    setDetails((d) => (d ? { ...d, display_name: displayName.trim() || null, username: normalizedUsername || null } : d));
    setUsername(normalizedUsername);
    void refreshProfile();
  }

  async function onLogBodyFat() {
    if (!userId) return;
    const percent = parseBodyFatPercent(bfInput);
    if (percent == null) {
      notifyUser("Body fat", "Enter a percentage between 2 and 70.");
      return;
    }
    setSavingBf(true);
    const { error } = await logBodyFat(userId, toLocalDateString(new Date()), percent);
    setSavingBf(false);
    if (error) {
      notifyUser("Could not save", error);
      return;
    }
    setBfInput("");
    const refreshed = await fetchBodyFatEntries();
    setEntries(refreshed.data);
  }

  async function onDeleteEntry(id: string) {
    const { error } = await deleteBodyFat(id);
    if (error) notifyUser("Could not delete", error);
    else setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (!user || !profile) return <Redirect href="/(auth)/login" />;

  if (loading && !details) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const since = details ? tenure(details.created_at) : null;
  const shownName = details?.display_name?.trim() || "You";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.hero, { backgroundColor: colors.bandBg.fresh }]}>
        <Text style={[styles.heroName, { color: colors.bandText.fresh }]}>{shownName}</Text>
        {details?.username ? (
          <Text style={[styles.heroHandle, { color: colors.bandText.fresh }]}>@{details.username}</Text>
        ) : null}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.bandText.fresh }]}>{since ? since.label : "—"}</Text>
            <Text style={[styles.statLabel, { color: colors.bandText.fresh }]}>
              {details ? `on Freshkeep since ${formatDay(details.created_at.slice(0, 10))}` : "on Freshkeep"}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.bandText.fresh }]}>{itemsAdded}</Text>
            <Text style={[styles.statLabel, { color: colors.bandText.fresh }]}>items you added</Text>
          </View>
        </View>
      </View>

      {loadError ? <Text style={{ color: colors.danger, fontSize: 13 }}>{loadError}</Text> : null}

      <Text style={[styles.section, { color: colors.textMuted }]}>Profile</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Display name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.faint, color: colors.text }]}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          placeholder="What your household sees"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={[styles.label, { color: colors.textMuted }]}>Username</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.faint, color: colors.text }]}
          value={username}
          onChangeText={setUsername}
          maxLength={21}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="@yourname"
          placeholderTextColor={colors.textMuted}
        />
        {usernameProblem ? <Text style={{ color: colors.danger, fontSize: 12 }}>{usernameProblem}</Text> : null}
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.brandBtn }, (!profileDirty || !!usernameProblem || savingProfile) && { opacity: 0.5 }]}
          onPress={() => void onSaveProfile()}
          disabled={!profileDirty || !!usernameProblem || savingProfile}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>{savingProfile ? "Saving…" : "Save profile"}</Text>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Body fat · private to you</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {summary ? (
          <View style={styles.bfSummary}>
            <View>
              <Text style={[styles.bfBig, { color: colors.text }]}>{summary.latest.percent.toFixed(1)}%</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                latest · {formatDay(summary.latest.recorded_on)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              {formatChange(summary.sincePrevious) ? (
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  {formatChange(summary.sincePrevious)} since last
                </Text>
              ) : null}
              {formatChange(summary.sinceFirst) ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {formatChange(summary.sinceFirst)} since {formatDay(summary.first.recorded_on)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            Log a reading to start tracking changes. Only you can see these.
          </Text>
        )}

        <View style={styles.bfInputRow}>
          <TextInput
            style={[styles.input, { flex: 1, minWidth: 0, backgroundColor: colors.faint, color: colors.text }]}
            value={bfInput}
            onChangeText={setBfInput}
            keyboardType="decimal-pad"
            placeholder="Today's %, e.g. 18.5"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Body fat percentage for today"
          />
          <Pressable
            style={[styles.logBtn, { backgroundColor: colors.brandBtn }, savingBf && { opacity: 0.5 }]}
            onPress={() => void onLogBodyFat()}
            disabled={savingBf}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>{savingBf ? "…" : "Log"}</Text>
          </Pressable>
        </View>

        {entries.slice(0, 10).map((e) => (
          <View key={e.id} style={[styles.entryRow, { borderTopColor: colors.sep }]}>
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{formatDay(e.recorded_on)}</Text>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginRight: spacing.md }}>
              {e.percent.toFixed(1)}%
            </Text>
            <Pressable
              onPress={() => void onDeleteEntry(e.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Delete reading from ${formatDay(e.recorded_on)}`}
            >
              <Text style={{ color: colors.textMuted }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  hero: { borderRadius: radius.xl, padding: 22, gap: 2 },
  heroName: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  heroHandle: { fontSize: 14, opacity: 0.7 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  stat: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 11, opacity: 0.7, marginTop: 2 },
  section: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  input: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16 },
  primaryBtn: { marginTop: spacing.xs, paddingVertical: 13, borderRadius: radius.md, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  bfSummary: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  bfBig: { fontSize: 34, fontWeight: "700", letterSpacing: -1 },
  bfInputRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.xs },
  logBtn: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: radius.md },
  entryRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingTop: spacing.sm },
});
