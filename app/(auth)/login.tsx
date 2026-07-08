import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { getAppName } from "@/lib/appInfo";
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

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { configured, user, loading, signIn } = useAuth();
  const appName = getAppName();
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
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      if (Platform.OS === 'web') window.alert(error.message);
      else Alert.alert("Sign in failed", error.message);
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
        {/* Decorative blob */}
        <View
          style={[
            styles.blob,
            {
              top: -10,
              right: -18,
              backgroundColor: colors.isDark ? "#240A10" : "#FDC4D0",
            },
          ]}
        />

        {/* Sticker pill */}
        <View
          style={[
            styles.stickerPill,
            {
              backgroundColor: colors.bandBg.fresh,
              transform: [{ rotate: "-3deg" }],
            },
          ]}
        >
          <Text style={[styles.stickerText, { color: colors.bandText.fresh }]}>
            Welcome back 🌿
          </Text>
        </View>

        <EditorialHeading
          bold="Sign in to"
          italic="your kitchen."
          size={34}
          color={colors.text}
          style={{ marginTop: 12, marginBottom: 8 }}
        />
        <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 24 }}>
          Track what spoils first in {appName}.
        </Text>

        {/* Form card */}
        <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: colors.text }]}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
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
            placeholder="••••••••"
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
            <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
          </Pressable>
        </View>

        <Link href="/(auth)/signup" asChild>
          <Pressable style={styles.linkWrap}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>
              New here?{" "}
              <Text style={{ color: colors.brand, fontWeight: "700" }}>Create account</Text>
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
    width: 130,
    height: 130,
    borderRadius: 65,
    opacity: 0.4,
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
