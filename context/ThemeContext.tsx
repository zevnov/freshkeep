import { darkColors, lightColors, type ThemeColors } from "@/constants/theme";
import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = 'system' | 'light' | 'dark';

export type AppColorScheme = "light" | "dark";

export type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  colorScheme: AppColorScheme;
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPreference = async () => {
  try {
        const storedPreference = await AsyncStorage.getItem('freshkeep-theme-pref');
        if (storedPreference) {
          setPreference(storedPreference as ThemePreference);
        }
      } catch (e) {
        console.error("Failed to load theme preference:", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreference();
  }, []);

  useEffect(() => {
    const savePreference = async () => {
      try {
        await AsyncStorage.setItem('freshkeep-theme-pref', preference);
      } catch (e) {
        console.error("Failed to save theme preference:", e);
      }
    };

    savePreference();
  }, [preference]);

  const colorScheme: AppColorScheme = preference === 'system' ? (system ?? 'light') : preference;
  const isDark = colorScheme === "dark";

  const value = useMemo<ThemeContextValue>(() => {
    return {
      preference,
      setPreference,
      colorScheme,
      colors: isDark ? darkColors : lightColors,
      isDark,
    };
  }, [preference, colorScheme]);

  if (isLoading) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}