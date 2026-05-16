import type { AppTheme } from "../app/theme";

const THEME_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const THEME_DURATION = "420ms";

/**
 * Единый transition для элементов, которые зависят от темы.
 *
 * Не анимируем размеры и позиционирование, чтобы интерфейс не прыгал
 * при переключении светлой/тёмной темы.
 */
export const THEME_TRANSITION = [
  `background ${THEME_DURATION} ${THEME_EASE}`,
  `background-color ${THEME_DURATION} ${THEME_EASE}`,
  `color ${THEME_DURATION} ${THEME_EASE}`,
  `border-color ${THEME_DURATION} ${THEME_EASE}`,
  `box-shadow ${THEME_DURATION} ${THEME_EASE}`,
  `opacity ${THEME_DURATION} ${THEME_EASE}`,
  `filter ${THEME_DURATION} ${THEME_EASE}`,
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
