import React from "react";

export type Style = React.CSSProperties;

export const ds = {
  color: {
    bgBase: "#0c0e12",
    bgTop: "#121318",

    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.82)",
    textTertiary: "rgba(255,255,255,0.62)",
    textQuaternary: "rgba(255,255,255,0.45)",

    surface: "rgba(28, 30, 36, 0.70)",
    surfaceStrong: "rgba(28, 30, 36, 0.90)",
    surfaceSoft: "rgba(28, 30, 36, 0.66)",

    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.12)",

    white: "#ffffff",
    black: "#0c0e12",
    inputBg: "#2a2d33",
    danger: "#ff6b6b",

    glowBlue: "rgba(65, 125, 255, 0.16)",
    glowPurple: "rgba(167, 94, 255, 0.14)",
    bgBlue: "rgba(96,132,255,0.16)",
    bgPurple: "rgba(129,92,255,0.12)",
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

  spacing: {
    xs: 4,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 14,
    xxl: 16,
    xxxl: 18,
    xxxx: 20,
    xxxxx: 22,
    x6: 24,
    x7: 28,
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
    heroButton: "0 16px 34px rgba(0,0,0,0.26)",
    card: "0 12px 30px rgba(0,0,0,0.16)",
    tabbar: "0 -10px 30px rgba(0,0,0,0.24)",
    sheet: "0 -20px 50px rgba(0,0,0,0.34)",
    button: "0 10px 28px rgba(0,0,0,0.22)",
  },

  blur: {
    card: "blur(22px)",
    tabbar: "blur(24px)",
  },
};