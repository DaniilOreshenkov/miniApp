/**
 * AppActionSheet — iOS-style action sheet, выезжает снизу.
 *
 * Анимация: слайд снизу + spring curve для открытия, ease-in для закрытия.
 * Backdrop: blur + затемнение, клик — закрытие.
 * Архитектура такая же как у AppAlert: shouldRender держит DOM живым во время
 * закрытия, isVisible управляет CSS-переходами.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import type { AppTheme } from "../app/theme";
import { THEME_TRANSITION, getThemeView } from "../utils/appTheme";

export type ActionSheetAction = {
  label: string;
  /** "default" | "destructive" | "cancel" */
  style?: "default" | "destructive" | "cancel";
  icon?: React.ReactNode;
  onPress: () => void;
};

type Props = {
  open: boolean;
  theme: AppTheme;
  /** Заголовок (обычно имя проекта) */
  title?: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
};

// ─── Animation constants ──────────────────────────────────────────────────────
const OPEN_MS = 340;
const CLOSE_MS = 220;
const OVERLAY_MS = 220;
const SPRING_EASE = "cubic-bezier(0.34, 1.18, 0.64, 1)";
const CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update) ?? mq.addListener?.(update);
    return () => mq.removeEventListener?.("change", update) ?? mq.removeListener?.(update);
  }, []);
  return reduced;
};

const AppActionSheet: React.FC<Props> = ({
  open,
  theme,
  title,
  subtitle,
  actions,
  onClose,
}) => {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const reduced = usePrefersReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const themeView = getThemeView(theme);

  // ── Mount / unmount + animation ────────────────────────────────────────────
  useEffect(() => {
    let raf1 = 0, raf2 = 0, closeTimer = 0;
    const closeDuration = reduced ? 0 : CLOSE_MS;

    if (open) {
      setShouldRender(true);
      setIsVisible(false);
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => { window.cancelAnimationFrame(raf1); window.cancelAnimationFrame(raf2); };
    }

    setIsVisible(false);
    closeTimer = window.setTimeout(() => setShouldRender(false), closeDuration);
    return () => window.clearTimeout(closeTimer);
  }, [open, reduced]);

  // ── Body scroll lock ───────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const active = open || shouldRender;
    root.classList.toggle("tg-alert-open", active);
    return () => root.classList.remove("tg-alert-open");
  }, [open, shouldRender]);

  const handleActionPress = useCallback((action: ActionSheetAction) => {
    onClose();
    // Небольшая задержка чтобы анимация закрытия не конфликтовала с action
    setTimeout(() => action.onPress(), 60);
  }, [onClose]);

  if (!shouldRender) return null;

  const openMs = reduced ? 0 : OPEN_MS;
  const closeMs = reduced ? 0 : CLOSE_MS;
  const overlayMs = reduced ? 0 : OVERLAY_MS;

  const cardTransition = isVisible
    ? `${THEME_TRANSITION}, opacity ${openMs}ms ${SPRING_EASE}, transform ${openMs}ms ${SPRING_EASE}`
    : `${THEME_TRANSITION}, opacity ${closeMs}ms ${CLOSE_EASE}, transform ${closeMs}ms ${CLOSE_EASE}`;

  const overlayTransition = `${THEME_TRANSITION}, opacity ${overlayMs}ms ease, backdrop-filter ${overlayMs}ms ease`;

  const cardBg = themeView.isLight ? "#ffffff" : themeView.cardStrong;
  const overlayBg = themeView.isLight ? "rgba(12,13,18,0.26)" : "rgba(0,0,0,0.56)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={rootStyle}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        style={{
          ...overlayStyle,
          background: overlayBg,
          opacity: isVisible ? 1 : 0,
          backdropFilter: isVisible ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: isVisible ? "blur(12px)" : "blur(0px)",
          transition: overlayTransition,
          pointerEvents: open || isVisible ? "auto" : "none",
        }}
      />

      {/* Sheet card */}
      <div
        ref={sheetRef}
        style={{
          ...sheetStyle,
          background: cardBg,
          border: `1px solid ${themeView.border}`,
          boxShadow: themeView.isLight
            ? "0 -8px 50px rgba(28,28,30,0.14)"
            : "0 -8px 50px rgba(0,0,0,0.48)",
          opacity: isVisible ? 1 : 0,
          transform: isVisible
            ? "translate3d(0, 0, 0)"
            : "translate3d(0, 100%, 0)",
          transition: cardTransition,
          pointerEvents: open || isVisible ? "auto" : "none",
        }}
      >
        {/* Drag handle */}
        <div style={{ ...handleStyle, background: themeView.isLight ? "rgba(28,28,30,0.18)" : "rgba(255,255,255,0.20)" }} />

        {/* Title / subtitle */}
        {(title || subtitle) ? (
          <div style={titleBlockStyle}>
            {title ? (
              <div style={{ ...titleStyle, color: themeView.textPrimary }}>
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div style={{ ...subtitleStyle, color: themeView.textSecondary }}>
                {subtitle}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Actions */}
        <div style={actionsStyle}>
          {actions.map((action, index) => {
            const isCancel = action.style === "cancel";
            const isDestructive = action.style === "destructive";

            const color = isDestructive
              ? "var(--danger)"
              : isCancel
              ? themeView.textSecondary
              : themeView.textPrimary;

            const bg = isCancel
              ? themeView.isLight
                ? "rgba(28,28,30,0.05)"
                : "rgba(255,255,255,0.06)"
              : "transparent";

            return (
              <React.Fragment key={index}>
                {index > 0 && !isCancel && actions[index - 1]?.style !== "cancel" ? (
                  <div style={{ ...dividerStyle, background: themeView.border }} />
                ) : null}

                <button
                  type="button"
                  onClick={() => handleActionPress(action)}
                  style={{
                    ...actionButtonStyle,
                    color,
                    background: bg,
                    marginTop: isCancel ? 8 : 0,
                  }}
                >
                  {action.icon ? (
                    <span style={actionIconStyle}>{action.icon}</span>
                  ) : null}
                  <span>{action.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Safe bottom area */}
        <div style={safeBottomStyle} />
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  pointerEvents: "none",
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  padding: 0,
  cursor: "default",
};

const sheetStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: 560,
  margin: "0 auto",
  borderRadius: "26px 26px 0 0",
  padding: "10px 12px 0",
  boxSizing: "border-box",
  willChange: "opacity, transform",
};

const handleStyle: React.CSSProperties = {
  width: 36,
  height: 4,
  borderRadius: 99,
  margin: "0 auto 16px",
};

const titleBlockStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "0 12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const titleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  lineHeight: 1.18,
  letterSpacing: "-0.02em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  transition: THEME_TRANSITION,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: ds.font.bodyMd,
  fontWeight: 600,
  lineHeight: 1.2,
  transition: THEME_TRANSITION,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderRadius: 18,
  overflow: "hidden",
  border: `1px solid transparent`,
};

const dividerStyle: React.CSSProperties = {
  width: "100%",
  height: 1,
  opacity: 0.6,
};

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 56,
  padding: "0 18px",
  border: "none",
  borderRadius: 0,
  display: "flex",
  alignItems: "center",
  gap: 12,
  fontSize: 17,
  fontWeight: 600,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  transition: `${THEME_TRANSITION}, opacity 100ms ease`,
  textAlign: "left",
};

const actionIconStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  opacity: 0.7,
};

const safeBottomStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "max(16px, env(safe-area-inset-bottom, 12px))",
};

export default React.memo(AppActionSheet);
