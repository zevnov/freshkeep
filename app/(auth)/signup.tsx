import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Link, Redirect } from "expo-router";
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

export default function SignupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { configured, user, loading, signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!configured) return <Redirect href="/setup" />;
  if (user) return <Redirect href="/(tabs)" />;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  async function onSubmit() {
    if (!displayName.trim()) {
      const msg = "Please enter your name or nickname.";
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert("Name required", msg);
      return;
    }
    setBusy(true);
    const { error } = await signUp(email, password, displayName.trim());
    setBusy(false);
    if (error) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert("Sign up failed", error.message);
    } else {
      const msg = "Check your email for a confirmation link.";
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert("Success!", msg);
    }
  }

  const inputBg = colors.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

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
        {/* Decorative blob — peach, top-left */}
        <View
          style={[
            styles.blob,
            {
              top: -18,
              left: -22,
              backgroundColor: colors.isDark ? "#220E00" : "#FFD0B0",
            },
          ]}
        />

        {/* Sticker pill */}
        <View
          style={[
            styles.stickerPill,
            {
              backgroundColor: colors.bandBg.today,
              transform: [{ rotate: "2deg" }],
            },
          ]}
        >
          <Text style={[styles.stickerText, { color: colors.bandText.today }]}>
            New kitchen 🥬
          </Text>
        </View>

        <EditorialHeading
          bold="Create your"
          italic="kitchen."
          size={34}
          color={colors.text}
          style={{ marginTop: 12, marginBottom: 24 }}
        />

        {/* Form card */}
        <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Your name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: colors.text }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Alex"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 12 }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: colors.text }]}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 12 }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: colors.text }]}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            style={[
              styles.button,
              { backgroundColor: colors.brandBtn },
              busy && { opacity: 0.6 },
            ]}
            onPress={() => void onSubmit()}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{busy ? "Creating…" : "Create account"}</Text>
          </Pressable>
        </View>

        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.linkWrap}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>
              Already have an account?{" "}
              <Text style={{ color: colors.brand, fontWeight: "700" }}>Sign in</Text>
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  blob: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.45,
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
  formCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
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
    paddingVertical: 12,
    fontSize: 15,
  },
  button: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkWrap: { alignItems: "center", paddingVertical: spacing.md },
});
