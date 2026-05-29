/**
 * Shared styles for full-screen editor flows:
 * CreateProjectScreen, ResizeProjectScreen, ImportImageScreen.
 *
 * One visual language: dark/light-aware cards, consistent spacing,
 * same top-bar, same inputs, same primary button.
 */

import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type React from "react";

/* ─── Root / Top bar ────────────────────────────────────────────────────── */

export const screenRoot: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  overflowY: "hidden",
  maxWidth: 520,
  marginLeft: "auto",
  marginRight: "auto",
};

export const screenTopBar: React.CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "52px 1fr 52px",
  alignItems: "center",
  gap: 8,
  padding: "var(--app-safe-top, 0px) 12px 0",
  height: "calc(var(--app-safe-top, 0px) + 56px)",
  background: "var(--bg)",
  borderBottom: `1px solid ${ds.color.border}`,
};

export const screenBackBtn: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.md,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

export const screenTitle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  letterSpacing: -0.2,
  textAlign: "center",
};

/* ─── Scroll area ────────────────────────────────────────────────────────── */

export const screenScroll: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "16px 16px 0",
  boxSizing: "border-box",
};

/* ─── Preview area ───────────────────────────────────────────────────────── */

export const screenPreview: React.CSSProperties = {
  width: "100%",
  height: "clamp(180px, 32vh, 260px)",
  borderRadius: 24,
  overflow: "hidden",
  flexShrink: 0,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

export const screenPreviewCanvas: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

/* ─── Section card ───────────────────────────────────────────────────────── */

/** Floating label above a card */
export const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.7,
  textTransform: "uppercase" as const,
  color: ds.color.textTertiary,
  paddingLeft: 4,
  marginBottom: -4,
};

/** Card wrapping a section's inputs/controls */
export const sectionCard: React.CSSProperties = {
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
  borderRadius: 20,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

/* ─── Inputs ─────────────────────────────────────────────────────────────── */

export const screenInput: React.CSSProperties = {
  ...ui.input,
  padding: "13px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 16,
  border: `1px solid ${ds.color.border}`,
};

export const screenInputError: React.CSSProperties = {
  ...ui.input,
  padding: "13px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 16,
  border: `1px solid ${ds.color.danger}`,
};

/* ─── Size row (W × H) ───────────────────────────────────────────────────── */

export const sizeRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const sizeField: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

export const sizeSubLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  color: ds.color.textTertiary,
  textTransform: "uppercase" as const,
};

export const sizeSep: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: 20,
  fontWeight: ds.weight.bold,
  flexShrink: 0,
  paddingTop: 18,
};

export const sizeHint: React.CSSProperties = {
  fontSize: 12,
  color: ds.color.textTertiary,
  paddingLeft: 2,
};

/* ─── Color chip row ─────────────────────────────────────────────────────── */

export const chipRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap" as const,
};

export const chip: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: ds.radius.pill,
  border: `1px solid ${ds.color.border}`,
  background: "var(--surface-strong)",
  color: ds.color.textSecondary,
  fontSize: 14,
  fontWeight: ds.weight.semibold,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
};

export const chipActive: React.CSSProperties = {
  background: ds.color.surfaceElevated,
  border: `1.5px solid ${ds.color.borderStrong}`,
  color: ds.color.textPrimary,
};

export const chipDot: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 6,
  flexShrink: 0,
};

/* ─── Color picker panel ─────────────────────────────────────────────────── */

export const colorPanel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 16,
  background: "var(--input-bg)",
  border: `1px solid ${ds.color.border}`,
};

export const colorPanelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

export const colorSwatch: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  flexShrink: 0,
  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
};

export const colorHex: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.5,
  fontVariantNumeric: "tabular-nums",
};

export const colorCustomBtn: React.CSSProperties = {
  position: "relative",
  height: 38,
  minWidth: 68,
  padding: "0 14px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #d9825f, #b85d6a)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  border: "none",
  WebkitTapHighlightColor: "transparent",
  flexShrink: 0,
};

export const colorDotsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
};

export const colorDot: React.CSSProperties = {
  aspectRatio: "1",
  borderRadius: "50%",
  padding: 0,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  transition: "box-shadow 120ms ease",
};

export const hiddenColorInput: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  cursor: "pointer",
  width: "100%",
  height: "100%",
};

/* ─── Sliders ────────────────────────────────────────────────────────────── */

export const sliderHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export const sliderLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

export const sliderValue: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: ds.color.textTertiary,
};

export const sliderWrap: React.CSSProperties = {
  width: "100%",
  height: 44,
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

export const sliderTrack: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 8,
  borderRadius: ds.radius.pill,
  background: "rgba(255,255,255,0.10)",
};

export const sliderFill: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  borderRadius: ds.radius.pill,
  background: ds.color.primary,
};

export const sliderThumb: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 26,
  height: 26,
  borderRadius: ds.radius.pill,
  background: "#ffffff",
  border: `3px solid ${ds.color.primary}`,
  boxShadow: "0 6px 18px rgba(0,0,0,0.30)",
  transform: "translate(-50%, -50%)",
};

/* ─── Primary action button ──────────────────────────────────────────────── */

export const primaryBtn: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  boxShadow: ds.shadow.button,
};

/* ─── Safe bottom spacer ─────────────────────────────────────────────────── */

export const safeBottom: React.CSSProperties = {
  flexShrink: 0,
  height: "max(20px, var(--app-tg-safe-bottom, 0px))",
};
