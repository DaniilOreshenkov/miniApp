import { ds, type Style } from "./tokens";

export const ui = {
  page: {
    width: "100%",
    position: "fixed",
    inset: 0,
    minHeight:
      "var(--tg-viewport-stable-height, var(--tg-stable-height-fallback, var(--app-height, 100vh)))",
    background: `
      radial-gradient(circle at top left, ${ds.color.bgBlue}, transparent 26%),
      radial-gradient(circle at top right, ${ds.color.bgPurple}, transparent 24%),
      linear-gradient(180deg, ${ds.color.bgTop} 0%, ${ds.color.bgBase} 100%)
    `,
    overflow: "hidden",
    overscrollBehavior: "none",
  } satisfies Style,

  contentWrapper: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    maxWidth: 860,
    margin: "0 auto",
    padding: "0 18px 120px",
    boxSizing: "border-box",
    height:
      "var(--tg-viewport-stable-height, var(--tg-stable-height-fallback, var(--app-height, 100vh)))",
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
  } satisfies Style,

  card: {
    background: ds.color.surface,
    border: `1px solid ${ds.color.border}`,
    boxShadow: ds.shadow.card,
  } satisfies Style,

  glassCard: {
    background: ds.color.surfaceSoft,
    border: `1px solid ${ds.color.border}`,
    backdropFilter: ds.blur.card,
  } satisfies Style,

  primaryButton: {
    background: ds.color.white,
    color: ds.color.black,
    border: "none",
    boxShadow: ds.shadow.heroButton,
    fontWeight: ds.weight.heavy,
    cursor: "pointer",
  } satisfies Style,

  secondaryButton: {
    background: "rgba(255,255,255,0.05)",
    color: ds.color.textPrimary,
    border: `1px solid ${ds.color.border}`,
    cursor: "pointer",
  } satisfies Style,

  iconButton: {
    background: "rgba(255,255,255,0.05)",
    color: ds.color.textPrimary,
    border: `1px solid ${ds.color.border}`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies Style,

  input: {
    background: ds.color.inputBg,
    color: ds.color.textPrimary,
    border: `1px solid ${ds.color.border}`,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  } satisfies Style,

  sectionTitle: {
    margin: 0,
    color: ds.color.textPrimary,
    fontSize: ds.font.sectionTitle,
    fontWeight: ds.weight.bold,
    letterSpacing: "-0.03em",
  } satisfies Style,

  screenTitle: {
    margin: 0,
    color: ds.color.textPrimary,
    fontSize: ds.font.screenTitle,
    lineHeight: 1.1,
    fontWeight: ds.weight.bold,
    letterSpacing: "-0.04em",
  } satisfies Style,

  bodyText: {
    color: ds.color.textTertiary,
    fontSize: ds.font.bodyMd,
    lineHeight: 1.5,
  } satisfies Style,
};