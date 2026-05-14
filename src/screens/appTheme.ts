import type { AppTheme } from "../App";

export const THEME_TRANSITION =
  "background 260ms ease, background-color 260ms ease, color 260ms ease, border-color 260ms ease, box-shadow 260ms ease, opacity 260ms ease, filter 260ms ease";

export const getThemeView = (theme: AppTheme = "dark") => {
  const isLight = theme === "light";

  return {
    isLight,
    background: "var(--bg)",
    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    card: "var(--surface)",
    cardStrong: "var(--surface-strong)",
    border: "var(--border)",
    previewBg: isLight ? "rgba(28,28,30,0.04)" : "rgba(255,255,255,0.06)",
    previewBorder: "var(--border)",
    bottomActive: "var(--tab-active-bg)",
    bottomInactive: "var(--tab-inactive-bg)",
    shadow: "var(--shadow-card)",
    glowBlue: "var(--glow-blue)",
    glowPurple: "var(--glow-purple)",
  };
};

export type ThemeView = ReturnType<typeof getThemeView>;
