/** 共享颜色常量（暗色主题） */
export const Colors = {
  background: "#0f0f10",
  surface: "#1a1a1c",
  surfaceRaised: "#222224",
  surfaceOverlay: "#2a2a2c",
  brand: "#7c6af7",
  brandHover: "#8f7fff",
  brandSubtle: "rgba(124,106,247,0.15)",
  text: "rgba(255,255,255,0.85)",
  textMuted: "rgba(255,255,255,0.4)",
  textDisabled: "rgba(255,255,255,0.2)",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  error: "#f87171",
  success: "#4ade80",
  warning: "#fbbf24",
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const Spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
} as const;
