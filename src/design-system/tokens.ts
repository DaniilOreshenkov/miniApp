import React from "react";

export type Style = React.CSSProperties;

export const ds = {
  color: {
    bgBase: "var(--bg-base)",
    bgTop: "var(--bg-top)",

    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    textTertiary: "var(--text-tertiary)",
    textQuaternary: "var(--text-quaternary)",

    surface: "var(--surface)",
    surfaceStrong: "var(--surface-strong)",
    surfaceSoft: "var(--surface-soft)",
    surfaceElevated: "var(--surface-elevated)",

    border: "var(--border)",
    borderStrong: "var(--border-strong)",

    white: "#ffffff",
    black: "#0c0e12",
    inputBg: "var(--input-bg)",
    danger: "var(--danger)",

    primary: "var(--primary)",
    primary2: "var(--primary-2)",
    primaryButtonBg: "var(--primary-button-bg)",
    primaryButtonText: "var(--primary-button-text)",
    primaryButtonIconBg: "var(--primary-button-icon-bg)",
    primaryButtonIconText: "var(--primary-button-icon-text)",

    secondaryButtonBg: "var(--secondary-button-bg)",
    iconButtonBg: "var(--icon-button-bg)",
    tabbarBg: "var(--tabbar-bg)",
    tabActiveBg: "var(--tab-active-bg)",
    tabInactiveBg: "var(--tab-inactive-bg)",

    glowBlue: "var(--glow-blue)",
    glowPurple: "var(--glow-purple)",
    bgBlue: "var(--bg-blue)",
    bgPurple: "var(--bg-purple)",
  },

  radius: {
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 22,
    hero: 24,
    sheet: 30,
    pill: 999,
  },

  font: {
    heroApp: 34,
    heroTitle: 20,
    sectionTitle: 22,
    screenTitle: 28,
    titleMd: 17,
    titleSm: 16,
    bodyLg: 15,
    bodyMd: 14,
    bodySm: 13,
    caption: 12,
    buttonHero: 20,
    buttonMd: 17,
    tab: 11,
  },

  weight: {
    medium: 500 as const,
    semibold: 700 as const,
    bold: 800 as const,
    heavy: 900 as const,
  },

  shadow: {
    heroButton: "var(--shadow-button)",
    card: "var(--shadow-card)",
    tabbar: "var(--shadow-tabbar)",
    sheet: "var(--shadow-sheet)",
    button: "var(--shadow-button)",
  },

  blur: {
    card: "blur(22px)",
    tabbar: "blur(24px)",
  },
};
