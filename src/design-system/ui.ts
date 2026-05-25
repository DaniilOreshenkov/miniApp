import { ds, type Style } from "./tokens";

export const ui = {
  page: {
    width: "100%",
    position: "fixed",
    inset: 0,
    minHeight: "var(--app-height, 100dvh)",
    height: "var(--app-height, 100dvh)",
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
    maxWidth: "var(--app-page-max-width, 860px)",
    margin: "0 auto",
    /* Верхний safe-top НЕ ставим в общем wrapper.
       Его ставит конкретный экран один раз, иначе на разных смартфонах появляется двойной отступ. */
    padding:
      "0 var(--app-page-x, 18px) var(--app-home-bottom-space, calc(var(--app-tg-content-safe-area-inset-bottom, 0px) + 110px))",
    boxSizing: "border-box",
    height: "var(--app-height, 100dvh)",
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    touchAction: "pan-y",
  } satisfies Style,

  card: {
    background: ds.color.surfaceStrong,
    border: `1px solid ${ds.color.border}`,
    boxShadow: ds.shadow.card,
  } satisfies Style,

  glassCard: {
    background: ds.color.surfaceStrong,
    border: `1px solid ${ds.color.border}`,
    backdropFilter: ds.blur.card,
    boxShadow: ds.shadow.card,
  } satisfies Style,

  primaryButton: {
    background: ds.color.primaryButtonBg,
    color: ds.color.primaryButtonText,
    border: "none",
    boxShadow: ds.shadow.heroButton,
    fontWeight: ds.weight.heavy,
    cursor: "pointer",
  } satisfies Style,

  secondaryButton: {
    background: ds.color.secondaryButtonBg,
    color: ds.color.textPrimary,
    border: `1px solid ${ds.color.border}`,
    cursor: "pointer",
  } satisfies Style,

  iconButton: {
    background: ds.color.iconButtonBg,
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
    fontSize: "var(--app-section-title-size, 24px)",
    fontWeight: ds.weight.bold,
    letterSpacing: "-0.03em",
  } satisfies Style,

  screenTitle: {
    margin: 0,
    color: ds.color.textPrimary,
    fontSize: "var(--app-title-size, 44px)",
    lineHeight: 1.1,
    fontWeight: ds.weight.bold,
    letterSpacing: "-0.04em",
  } satisfies Style,

  bodyText: {
    color: ds.color.textTertiary,
    fontSize: "var(--app-body-md-size, 15px)",
    lineHeight: 1.5,
  } satisfies Style,
};
