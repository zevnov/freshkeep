import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { Link, Redirect } from "expo-router";
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
    container: {
      flex: 1,
      padding: spacing.lg,
      paddingTop: spacing.xl,
      gap: spacing.sm,
    },
    lead: {
      fontSize: 18,
      color: colors.text,
      marginBottom: spacing.md,
      lineHeight: 26,
    },
    label: {
      marginTop: spacing.sm,
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    button: {
      marginTop: spacing.lg,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
    linkWrap: { marginTop: spacing.md, alignItems: "center" },
    link: { color: colors.primary, fontSize: 15 },
  });
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { configured, user, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return <Redirect href="/setup" />;
  }
  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSubmit() {
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) Alert.alert("Sign in failed", error.message);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.lead}>Track what spoils first—starting with your kitchen.</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
        </Pressable>
        <Link href="/(auth)/signup" asChild>
          <Pressable style={styles.linkWrap}>
            <Text style={styles.link}>New here? Create an account</Text>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
