import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { spacing } from "@/constants/theme";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      padding: spacing.lg,
      paddingTop: spacing.xl * 2,
      gap: spacing.md,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
    },
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.textMuted,
    },
    mono: {
      fontFamily: "Menlo",
      fontSize: 14,
      color: colors.text,
    },
  });
}

export default function SetupScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Configure Supabase</Text>
      <Text style={styles.body}>
        Copy <Text style={styles.mono}>.env.example</Text> to <Text style={styles.mono}>.env</Text> and set{" "}
        <Text style={styles.mono}>EXPO_PUBLIC_SUPABASE_URL</Text> and{" "}
        <Text style={styles.mono}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text> from your Supabase project API settings.
      </Text>
      <Text style={styles.body}>
        Then run the SQL in <Text style={styles.mono}>supabase/schema.sql</Text> in the Supabase SQL editor, restart Expo,
        and return to this app.
      </Text>
    </View>
  );
}
