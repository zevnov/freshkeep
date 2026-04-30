import { darkColors, lightColors, type ThemeColors } from "@/constants/theme";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type AppColorScheme = "light" | "dark";

export type ThemeContextValue = {
  colorScheme: AppColorScheme;
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const colorScheme: AppColorScheme = system === "dark" ? "dark" : "light";
  const value = useMemo<ThemeContextValue>(() => {
    const isDark = colorScheme === "dark";
    return {
      colorScheme,
      colors: isDark ? darkColors : lightColors,
      isDark,
    };
  }, [colorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
