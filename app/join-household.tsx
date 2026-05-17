import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";
import * as Sentry from "@sentry/react-native";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

export default function JoinHouseholdScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();
  const { refresh: refreshItems } = useItems();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function onJoin() {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      const msg = "Paste or type the invite code from your household.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Code needed", msg);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("join_household", { invite_code: trimmed });
      if (error) {
        if (Platform.OS === "web") window.alert(error.message);
        else Alert.alert("Could not join", error.message);
        return;
      }
      const res = data as JoinResult | null;
      if (!res?.ok) {
        const msg = joinErrorMessage(res?.error);
        if (Platform.OS === "web") window.alert(msg);
        else Alert.alert("Could not join", msg);
        return;
      }
      await refreshProfile();
      await refreshItems();
      if (res.already_member) {
        const title = "Already in";
        const msg = "You are already part of this household.";
        if (Platform.OS === "web") {
          window.alert(msg);
          router.back();
        } else {
          Alert.alert(title, msg, [{ text: "OK", onPress: () => router.back() }]);
        }
        return;
      }
      const title = "Welcome";
      const msg = "You have joined the shared household.";
      if (Platform.OS === "web") {
        window.alert(msg);
        router.back();
      } else {
        Alert.alert(title, msg, [{ text: "OK", onPress: () => router.back() }]);
      }
    } catch (err) {
      Sentry.captureException(err);
      const msg = "Something went wrong. Please try again.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  }

  const inputBg = colors.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const lavBg = colors.isDark ? "#150E28" : "#D8CCFF";

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Decorative blob — lavender */}
        <View
          style={[
            styles.blob,
            {
              top: -15,
              left: -20,
              backgroundColor: lavBg,
              opacity: 0.4,
            },
          ]}
        />

        {/* Sticker pill */}
        <View
          style={[
            styles.stickerPill,
            {
              backgroundColor: colors.bandBg.fresh,
              transform: [{ rotate: "-2deg" }],
            },
          ]}
        >
          <Text style={[styles.stickerText, { color: colors.bandText.fresh }]}>
            Moving in 📦
          </Text>
        </View>

        <EditorialHeading
          bold="Join a"
          italic="household."
          size={34}
          color={colors.text}
          style={{ marginTop: 12, marginBottom: 8 }}
        />
        <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 24 }}>
          Ask a member for their code to share a kitchen.
        </Text>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
           <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 20 }}>
            Codes last 7 days. If you're solo, clear your list first.
          </Text>
        </View>

        {/* Form card */}
        <View style={[styles.formCard, { backgroundColor: colors.surface, marginTop: 16 }]}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Invite Code</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: colors.text }]}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="E.g. A1B2C3D4"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            style={[
              styles.button,
              { backgroundColor: colors.brandBtn },
              busy && { opacity: 0.6 },
            ]}
            onPress={() => void onJoin()}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join kitchen</Text>}
          </Pressable>
        </View>

        <Pressable style={styles.linkWrap} onPress={() => router.back()}>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>
            Change your mind? <Text style={{ color: colors.brand, fontWeight: "700" }}>Go back</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  blob: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  stickerPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 12,
  },
  stickerText: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  infoCard: {
    borderRadius: 20,
    padding: 16,
    opacity: 0.9,
  },
  formCard: {
    borderRadius: 24,
    padding: 20,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
  },
  button: {
    marginTop: spacing.md,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkWrap: { alignItems: "center", paddingVertical: spacing.xl },
});
