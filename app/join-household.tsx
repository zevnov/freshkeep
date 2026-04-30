import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type JoinResult = { ok: boolean; error?: string; already_member?: boolean };

function joinErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_or_expired_code":
      return "That code is invalid or expired.";
    case "solo_household_has_active_items":
      return "You're the only person in your current kitchen and it still has active items. Mark them as used or discarded on Home, then try again.";
    default:
      return "Something went wrong.";
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1, padding: spacing.lg, gap: spacing.md },
    lead: { fontSize: 16, lineHeight: 24, color: colors.textMuted },
    note: { fontSize: 14, lineHeight: 20, color: colors.textMuted, paddingVertical: 4, paddingHorizontal: 2 },
    label: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontSize: 18,
      letterSpacing: 2,
      fontWeight: "600",
      color: colors.text,
      backgroundColor: colors.surface,
    },
    button: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
    cancel: { alignItems: "center", paddingVertical: spacing.md },
    cancelText: { color: colors.textMuted, fontSize: 16 },
  });
}

export default function JoinHouseholdScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshProfile } = useAuth();
  const { refresh: refreshItems } = useItems();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function onJoin() {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      Alert.alert("Code needed", "Paste or type the invite code from your household.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("join_household", { invite_code: trimmed });
    setBusy(false);
    if (error) {
      Alert.alert("Could not join", error.message);
      return;
    }
    const res = data as JoinResult | null;
    if (!res?.ok) {
      Alert.alert("Could not join", joinErrorMessage(res?.error));
      return;
    }
    await refreshProfile();
    await refreshItems();
    if (res.already_member) {
      Alert.alert("Already in", "You are already part of this household.", [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }
    Alert.alert("Welcome", "You have joined the shared household.", [{ text: "OK", onPress: () => router.back() }]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.lead}>
          Ask a household member to open Household and create an invite code. Codes last 7 days and can be shared with
          multiple people.
        </Text>
        <Text style={styles.note}>
          If you're the only one in your kitchen, clear active items (use or discard) before joining another household so
          nothing is left behind.
        </Text>
        <Text style={styles.label}>Invite code</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="E.g. A1B2C3D4"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={() => void onJoin()} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Join household</Text>}
        </Pressable>
        <Pressable style={styles.cancel} onPress={() => router.back()} disabled={busy}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
