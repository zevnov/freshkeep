import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import {
  getExpoNotificationPermissionsAsync,
  nativeNotificationsSupported,
  requestExpoNotificationPermissionsAsync,
  rescheduleAllItems,
} from "@/lib/notifications";
import type { NotificationStyle } from "@/types";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Redirect, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatDigestTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function SettingsScreen() {
  const { colors, isDark, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const pickerTheme = isDark ? "dark" : "light";
  const { configured, user, profile, signOut, updateNotificationPrefs } = useAuth();
  const { items, refresh } = useItems();
  const [busy, setBusy] = useState(false);
  const [showDigestTime, setShowDigestTime] = useState(false);

  const prefs = profile?.notification_prefs;

  const lavBg = isDark ? "#150E28" : "#D8CCFF";
  const lavTx = "#2A1A6B";

  const toggle = useCallback(
    async (patch: Parameters<typeof updateNotificationPrefs>[0]) => {
      if (!prefs) return;
      const needsPermission =
        patch.masterEnabled === true ||
        (patch.notificationStyle === "digest" && prefs.masterEnabled);
      if (needsPermission && nativeNotificationsSupported) {
        const existing = await getExpoNotificationPermissionsAsync();
        if (existing && existing.status !== "granted") {
          const next = await requestExpoNotificationPermissionsAsync();
          if (next && next.status !== "granted") {
            Alert.alert("Notifications", "Permission is required to send reminders.");
            return;
          }
        }
      }
      setBusy(true);
      const { error } = await updateNotificationPrefs(patch);
      setBusy(false);
      if (error) Alert.alert("Could not save", error.message);
      else {
        const merged = { ...prefs, ...patch };
        await rescheduleAllItems(items, merged);
      }
    },
    [prefs, updateNotificationPrefs, items]
  );

  if (!configured) return <Redirect href="/setup" />;
  if (!user || !profile || !prefs) return <Redirect href="/(auth)/login" />;

  const styleChip = (active: boolean) => ({
    paddingHorizontal: 17,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: active ? colors.brandBtn : colors.faint,
  });

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 120 },
      ]}
    >
      {/* Lavender hero card */}
      <View style={[styles.heroCard, { backgroundColor: lavBg, overflow: "hidden" }]}>
        <View
          style={[
            styles.stickerPill,
            { backgroundColor: "rgba(0,0,0,0.09)", transform: [{ rotate: "-2deg" }] },
          ]}
        >
          <Text style={[styles.stickerText, { color: lavTx }]}>Account & prefs</Text>
        </View>
        <EditorialHeading
          bold="Settings &"
          italic="preferences."
          size={26}
          color={lavTx}
          style={{ marginTop: 10 }}
        />
        {/* Deco star */}
        <Text
          style={[
            styles.decoStar,
            { color: "rgba(0,0,0,0.08)", transform: [{ rotate: "20deg" }] },
          ]}
        >
          ✦
        </Text>
      </View>

      {/* Account card */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Account</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>
          {profile.display_name || "Signed in"}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
          {user.email}
        </Text>
      </View>

      {/* Join household link */}
      <Pressable
        style={[styles.card, { backgroundColor: colors.bandBg.fresh }]}
        onPress={() => router.push("/join-household")}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.bandText.fresh }}>
          Join with invite code →
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.bandText.fresh,
            opacity: 0.6,
            lineHeight: 19,
          }}
        >
          Move into a shared kitchen. Clear active items first.
        </Text>
      </Pressable>

      {/* Notifications card */}
      
      {/* Appearance section */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.chipRow}>
          {(
            [
              ['system', 'System'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ] as const
          ).map(([key, label]) => {
            const active = preference === key;
            return (
              <Pressable
                key={key}
                style={styleChip(active)}
                onPress={() => setPreference(key)}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#fff" : colors.textMuted }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Notifications</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {!nativeNotificationsSupported ? (
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.today, marginBottom: spacing.xs }}>
            Expo Go on Android cannot schedule local reminders (SDK 53+). Use a development build to test alerts.
          </Text>
        ) : null}

        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Enable reminders</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              Choose per-item or daily summary
            </Text>
          </View>
          <Switch
            value={prefs.masterEnabled}
            onValueChange={(v) => void toggle({ masterEnabled: v })}
            disabled={busy}
          />
        </View>

        <View style={[styles.divider, { borderTopColor: colors.sep }]} />

        <Text style={[styles.subLabel, { color: colors.textMuted }]}>Delivery</Text>
        <View style={styles.chipRow}>
          {(
            [
              ["individual", "Per item"],
              ["digest", "Daily digest"],
            ] as const
          ).map(([key, label]) => {
            const active = prefs.notificationStyle === key;
            return (
              <Pressable
                key={key}
                style={styleChip(active)}
                onPress={() => void toggle({ notificationStyle: key as NotificationStyle })}
                disabled={busy || !prefs.masterEnabled}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#fff" : colors.textMuted }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {prefs.notificationStyle === "digest" && prefs.masterEnabled ? (
          <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
            <Text style={[styles.subLabel, { color: colors.textMuted }]}>Digest time</Text>
            <Pressable
              style={[styles.timeBtn, { backgroundColor: colors.faint }]}
              onPress={() => setShowDigestTime(true)}
            >
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
                {formatDigestTime(prefs.digestHour, prefs.digestMinute)}
              </Text>
            </Pressable>
            {showDigestTime ? (
              <>
                <DateTimePicker
                  value={(() => {
                    const d = new Date();
                    d.setHours(prefs.digestHour, prefs.digestMinute, 0, 0);
                    return d;
                  })()}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  themeVariant={pickerTheme}
                  onChange={(_, d) => {
                    if (Platform.OS === "android") setShowDigestTime(false);
                    if (d) void toggle({ digestHour: d.getHours(), digestMinute: d.getMinutes() });
                  }}
                />
                {Platform.OS === "ios" ? (
                  <Pressable
                    style={[styles.doneBtn, { backgroundColor: colors.brandBtn }]}
                    onPress={() => setShowDigestTime(false)}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Done</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.divider, { borderTopColor: colors.sep }]} />

        <Text style={[styles.subLabel, { color: colors.textMuted }]}>
          {prefs.notificationStyle === "digest" ? "Digest includes" : "Alert types"}
        </Text>

        {(
          [
            ["Use soon", prefs.notifySoon, (v: boolean) => toggle({ notifySoon: v })],
            ["Spoil day", prefs.notifyToday, (v: boolean) => toggle({ notifyToday: v })],
            ["Overdue", prefs.notifyOverdue, (v: boolean) => toggle({ notifyOverdue: v })],
            ["Include My bucket", prefs.includeMine, (v: boolean) => toggle({ includeMine: v })],
          ] as const
        ).map(([label, val, fn]) => (
          <View key={label} style={styles.rowBetween}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>{label}</Text>
            <Switch
              value={val}
              onValueChange={(v) => void fn(v)}
              disabled={busy || !prefs.masterEnabled}
            />
          </View>
        ))}
      </View>

      {/* Sign out */}
      <Pressable
        style={[styles.signOutBtn, { backgroundColor: colors.faint }]}
        onPress={() => {
          const doSignOut = () => {
            void (async () => {
              await signOut();
              if (Platform.OS === "web") {
                window.location.replace("/login");
              } else {
                await refresh();
                router.replace("/(auth)/login");
              }
            })();
          };
          if (Platform.OS === "web") {
            if (window.confirm("Sign out?")) doSignOut();
          } else {
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: doSignOut },
            ]);
          }
        }}
      >
        <Text style={[styles.signOutText, { color: colors.danger }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.md, gap: spacing.md },
  heroCard: {
    borderRadius: radius.xl,
    padding: 22,
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
  decoStar: {
    position: "absolute",
    top: 14,
    right: 18,
    fontSize: 36,
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  divider: {
    borderTopWidth: 1,
    marginVertical: 4,
  },
  subLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  chipRow: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  timeBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  doneBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  signOutBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  signOutText: {
    fontWeight: "700",
    fontSize: 15,
  },
});
