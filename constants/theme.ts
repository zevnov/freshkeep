/** Semantic app colors; values differ for light and dark appearance. */
export type ThemeColors = {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryMuted: string;
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
};

export const lightColors: ThemeColors = {
  bg: "#f4f7f4",
  surface: "#ffffff",
  text: "#1a2e1a",
  textMuted: "#5c6b5c",
  border: "#d8e3d8",
  primary: "#3d6b47",
  primaryMuted: "#e8f2ea",
  ours: "#2f6b8f",
  oursBg: "#e8f2f8",
  mine: "#8b5cf6",
  mineBg: "#f0ebff",
  fresh: "#3d6b47",
  soon: "#c47f00",
  today: "#c45c26",
  overdue: "#b3261e",
  danger: "#b3261e",
  onPrimary: "#ffffff",
  overlay: "#ffffff",
  overlayMuted: "#f0f0f0",
  shadow: "#000000",
};

export const darkColors: ThemeColors = {
  bg: "#0f140f",
  surface: "#1a221a",
  text: "#e6eee6",
  textMuted: "#8a9d8a",
  border: "#2a362a",
  primary: "#6bc47a",
  primaryMuted: "#1f2e1f",
  ours: "#7ec4ea",
  oursBg: "#1a2832",
  mine: "#b794f6",
  mineBg: "#2a2238",
  fresh: "#7ed391",
  soon: "#e6a030",
  today: "#e88850",
  overdue: "#f0665c",
  danger: "#f0665c",
  onPrimary: "#0a120a",
  overlay: "#ffffff",
  overlayMuted: "#d0ddd0",
  shadow: "#000000",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};
