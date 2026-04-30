import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
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
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

function formatDigestTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
    section: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    expoGoNote: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.today,
      marginBottom: spacing.xs,
    },
    mono: { fontFamily: "Menlo", fontSize: 12, color: colors.text },
    rowLabel: { fontSize: 16, color: colors.text, fontWeight: "600" },
    rowValue: { fontSize: 15, color: colors.textMuted },
    rowMuted: { fontSize: 14, color: colors.textMuted },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    caption: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 4 },
    subLabel: {
      marginTop: spacing.md,
      fontSize: 12,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    styleRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, flexWrap: "wrap" },
    styleChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    styleChipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
    styleChipText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
    styleChipTextOn: { color: colors.primary },
    digestTimeBlock: { marginTop: spacing.sm, gap: spacing.xs },
    timeButton: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    timeButtonText: { fontSize: 17, fontWeight: "600", color: colors.text },
    doneIOS: {
      alignSelf: "flex-start",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
    },
    doneIOSText: { color: colors.onPrimary, fontWeight: "700" },
    linkCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    linkTitle: { fontSize: 16, fontWeight: "600", color: colors.primary },
    linkSub: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    signOut: {
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      alignItems: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    signOutText: { color: colors.danger, fontWeight: "600", fontSize: 16 },
  });
}

export default function SettingsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pickerTheme = isDark ? "dark" : "light";
  const { configured, user, profile, signOut, updateNotificationPrefs } = useAuth();
  const { items, refresh } = useItems();
  const [busy, setBusy] = useState(false);
  const [showDigestTime, setShowDigestTime] = useState(false);

  const prefs = profile?.notification_prefs;

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

  if (!configured) {
    return <Redirect href="/setup" />;
  }
  if (!user || !profile || !prefs) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Signed in as</Text>
        <Text style={styles.rowValue}>{user.email}</Text>
        {profile.display_name ? (
          <Text style={styles.rowMuted}>{profile.display_name}</Text>
        ) : null}
      </View>

      <Text style={styles.section}>Household</Text>
      <Pressable style={styles.linkCard} onPress={() => router.push("/join-household")}>
        <Text style={styles.linkTitle}>Join with invite code</Text>
        <Text style={styles.linkSub}>
          Move your account into a shared kitchen. If you're alone in your current one, clear active items first.
        </Text>
      </Pressable>

      <Text style={styles.section}>Notifications</Text>
      <View style={styles.card}>
        {!nativeNotificationsSupported ? (
          <Text style={styles.expoGoNote}>
            Expo Go on Android cannot schedule local reminders (SDK 53+). Use a development build to test alerts: run{" "}
            <Text style={styles.mono}>npx expo run:android</Text> or an EAS dev client. Settings below still save for
            when you use a real build.
          </Text>
        ) : null}
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Enable reminders</Text>
          <Switch
            value={prefs.masterEnabled}
            onValueChange={(v) => void toggle({ masterEnabled: v })}
            disabled={busy}
          />
        </View>
        <Text style={styles.caption}>Choose one daily summary or separate alerts per item.</Text>
        <Text style={styles.subLabel}>Delivery</Text>
        <View style={styles.styleRow}>
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
                style={[styles.styleChip, active && styles.styleChipOn]}
                onPress={() => void toggle({ notificationStyle: key as NotificationStyle })}
                disabled={busy || !prefs.masterEnabled}
              >
                <Text style={[styles.styleChipText, active && styles.styleChipTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {prefs.notificationStyle === "digest" && prefs.masterEnabled ? (
          <View style={styles.digestTimeBlock}>
            <Text style={styles.subLabel}>Digest time</Text>
            <Pressable style={styles.timeButton} onPress={() => setShowDigestTime(true)}>
              <Text style={styles.timeButtonText}>{formatDigestTime(prefs.digestHour, prefs.digestMinute)}</Text>
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
                  <Pressable style={styles.doneIOS} onPress={() => setShowDigestTime(false)}>
                    <Text style={styles.doneIOSText}>Done</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            <Text style={styles.caption}>
              One notification each day with counts for use soon, due today, and overdue. Open the app to refresh counts
              after you change items.
            </Text>
          </View>
        ) : null}
        <Text style={styles.subLabel}>
          {prefs.notificationStyle === "digest" ? "Digest includes" : "Alert types"}
        </Text>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Use soon</Text>
          <Switch
            value={prefs.notifySoon}
            onValueChange={(v) => void toggle({ notifySoon: v })}
            disabled={busy || !prefs.masterEnabled}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Spoil day</Text>
          <Switch
            value={prefs.notifyToday}
            onValueChange={(v) => void toggle({ notifyToday: v })}
            disabled={busy || !prefs.masterEnabled}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Overdue</Text>
          <Switch
            value={prefs.notifyOverdue}
            onValueChange={(v) => void toggle({ notifyOverdue: v })}
            disabled={busy || !prefs.masterEnabled}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Include My bucket</Text>
          <Switch
            value={prefs.includeMine}
            onValueChange={(v) => void toggle({ includeMine: v })}
            disabled={busy || !prefs.masterEnabled}
          />
        </View>
      </View>

      <Pressable
        style={styles.signOut}
        onPress={() => {
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign out",
              style: "destructive",
              onPress: () => {
                void (async () => {
                  await signOut();
                  await refresh();
                })();
              },
            },
          ]);
        }}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
