import type { AppTheme } from "../app/theme";

const UI_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Базовый transition для интерактивных элементов.
 *
 * Важно: здесь больше не анимируем массово background/color/box-shadow.
 * При смене темы эти свойства меняются сразу, а плавность создаёт один
 * crossfade-слой поверх экрана. Это заметно легче для Telegram WebView.
 */
export const THEME_TRANSITION = [
  `opacity 180ms ${UI_EASE}`,
  `transform 180ms ${UI_EASE}`,
].join(", ");

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
