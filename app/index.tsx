import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      paddingHorizontal: 24,
      gap: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
    hint: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 22,
    },
    button: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 12,
      minWidth: 160,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
    link: { paddingVertical: 8 },
    linkText: { color: colors.primary, fontSize: 16 },
  });
}

export default function Index() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { configured, loading, user, profile, refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (!configured) {
    return <Redirect href="/setup" />;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user && !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn&apos;t load your profile</Text>
        <Text style={styles.hint}>
          Check your connection and Supabase setup. If you just signed up, wait a moment and try again.
        </Text>
        <Pressable
          style={[styles.button, retrying && styles.buttonDisabled]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await refreshProfile();
            setRetrying(false);
          }}
        >
          {retrying ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>Retry</Text>
          )}
        </Pressable>
        <Pressable style={styles.link} onPress={() => void signOut()}>
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
