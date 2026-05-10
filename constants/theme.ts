/** Semantic app colors; values differ for light and dark appearance. */
export type ThemeColors = {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryMuted: string;
  faint: string;
  sep: string;
  brand: string;
  brandBtn: string;
  ours: string;
  oursBg: string;
  mine: string;
  mineBg: string;
  fresh: string;
  soon: string;
  today: string;
  overdue: string;
  danger: string;
  /** Text/icons on `primary` filled controls */
  onPrimary: string;
  /** High-contrast foreground on dark overlays (e.g. camera UI) */
  overlay: string;
  overlayMuted: string;
  shadow: string;
  /** Pastel band fill backgrounds */
  bandBg: { fresh: string; soon: string; today: string; overdue: string };
  /** Text color on pastel band fills */
  bandText: { fresh: string; soon: string; today: string; overdue: string };
  /** Yellow accent for FAB */
  yellow: string;
  /** Whether this is the dark variant */
  isDark: boolean;
};

export const lightColors: ThemeColors = {
  bg: "#F8F5EE",
  surface: "#FFFFFF",
  text: "#1A1A17",
  textMuted: "#777065",
  border: "#EDEBE4",
  primary: "#1A4214",
  primaryMuted: "#e8f2ea",
  faint: "#EDEBE4",
  sep: "rgba(0,0,0,0.07)",
  brand: "#1A4214",
  brandBtn: "#1A4214",
  ours: "#2f6b8f",
  oursBg: "#e8f2f8",
  mine: "#8b5cf6",
  mineBg: "#f0ebff",
  fresh: "#14401A",
  soon: "#4A3200",
  today: "#4A2000",
  overdue: "#4A0E0E",
  danger: "#9A1A1A",
  onPrimary: "#ffffff",
  overlay: "#ffffff",
  overlayMuted: "#f0f0f0",
  shadow: "#000000",
  bandBg: {
    fresh: "#C3E8BB",
    soon: "#FFE07A",
    today: "#FFD0B0",
    overdue: "#F5A0A0",
  },
  bandText: {
    fresh: "#14401A",
    soon: "#4A3200",
    today: "#4A2000",
    overdue: "#4A0E0E",
  },
  yellow: "#FFE07A",
  isDark: false,
};

export const darkColors: ThemeColors = {
  bg: "#131313",
  surface: "#1C1C1A",
  text: "#F0EDE6",
  textMuted: "#888278",
  border: "#2A2A28",
  primary: "#9FD89A",
  primaryMuted: "#1f2e1f",
  faint: "#282824",
  sep: "rgba(255,255,255,0.07)",
  brand: "#9FD89A",
  brandBtn: "#2A5A26",
  ours: "#7ec4ea",
  oursBg: "#1a2832",
  mine: "#b794f6",
  mineBg: "#2a2238",
  fresh: "#9FD89A",
  soon: "#FFD850",
  today: "#FFB070",
  overdue: "#F07070",
  danger: "#F07070",
  onPrimary: "#0a120a",
  overlay: "#ffffff",
  overlayMuted: "#d0ddd0",
  shadow: "#000000",
  bandBg: {
    fresh: "#0F2A18",
    soon: "#241C00",
    today: "#220E00",
    overdue: "#240800",
  },
  bandText: {
    fresh: "#9FD89A",
    soon: "#FFD850",
    today: "#FFB070",
    overdue: "#F07070",
  },
  yellow: "#FFE07A",
  isDark: true,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};
