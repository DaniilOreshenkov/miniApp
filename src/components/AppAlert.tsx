/**
 * AppAlert — модальный диалог / алерт с нативной анимацией
 *
 * Архитектура анимации (два слоя, как в шитах):
 *
 *   keyboardLiftRef  — сдвигает карточку вверх когда открыта клавиатура.
 *                      transform пишется прямо в DOM ref, без React state —
 *                      никаких re-render во время анимации клавиатуры.
 *
 *   card             — CSS transition для open/close (opacity + scale + translateY).
 *                      Кривые: spring для открытия, ease-in для закрытия.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import type { AppTheme } from "../app/theme";
import { THEME_TRANSITION, getThemeView } from "../utils/appTheme";

type AlertVariant = "info" | "danger" | "input";

type Props = {
  open: boolean;
  theme: AppTheme;
  title: string;
  message?: string;
  variant?: AlertVariant;
  value?: string;
  inputLabel?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
};

// ─── Animation constants ──────────────────────────────────────────────────────
const OPEN_MS = 320;
const CLOSE_MS = 200;
const OVERLAY_MS = 220;
// Spring для открытия (лёгкий overshoot), резкий ease-in для закрытия.
const SPRING_EASE = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";
const FOCUS_DELAY_MS = 200;

// ─── usePrefersReducedMotion ──────────────────────────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────────────────
const AppAlert: React.FC<Props> = ({
  open,
  theme,
  title,
  message,
  variant = "info",
  value = "",
  inputLabel,
  placeholder,
  confirmText = "ОК",
  cancelText = "Отмена",
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState(value);
  // shouldRender: keeps DOM alive during close animation
  const [shouldRender, setShouldRender] = useState(open);
  // isVisible: drives CSS transition state (false = start/end keyframe, true = visible)
  const [isVisible, setIsVisible] = useState(open);

  const inputRef = useRef<HTMLInputElement | null>(null);
  // keyboardLiftRef: outer wrapper moved directly via DOM to follow keyboard.
  // No React state — direct DOM write so keyboard tracking is always one RAF away.
  const keyboardLiftRef = useRef<HTMLDivElement | null>(null);
  // Mirrors whether the card is currently in the "visible" state so the
  // keyboard handler can compose the right transform without stale closure risk.
  const isVisibleRef = useRef(open);

  const themeView = getThemeView(theme);
  const isInputMode = variant === "input";
  const isDangerMode = variant === "danger";
  const canConfirm = !isInputMode || inputValue.trim().length > 0;
  const reduced = usePrefersReducedMotion();

  // ── Sync input value when alert reopens ────────────────────────────────────
  useEffect(() => {
    if (open) setInputValue(value);
  }, [open, value]);

  // ── Lock viewport class ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const active = open || shouldRender;
    root.classList.toggle("tg-alert-open", active);
    return () => root.classList.remove("tg-alert-open");
  }, [open, shouldRender]);

  // ── Mount / unmount + open/close animation ─────────────────────────────────
  useEffect(() => {
    let raf1 = 0, raf2 = 0, closeTimer = 0;
    const closeDuration = reduced ? 0 : CLOSE_MS;

    if (open) {
      setShouldRender(true);
      setIsVisible(false);
      isVisibleRef.current = false;
      // Two RAFs: first gets the element into the DOM, second triggers transition.
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          setIsVisible(true);
          isVisibleRef.current = true;
        });
      });
      return () => { window.cancelAnimationFrame(raf1); window.cancelAnimationFrame(raf2); };
    }

    setIsVisible(false);
    isVisibleRef.current = false;
    closeTimer = window.setTimeout(() => setShouldRender(false), closeDuration);
    return () => window.clearTimeout(closeTimer);
  }, [open, reduced]);

  // ── Auto-focus input ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !isVisible || !isInputMode) return;
    const t = window.setTimeout(() => {
      try { inputRef.current?.focus({ preventScroll: true }); } catch { inputRef.current?.focus(); }
      inputRef.current?.select();
    }, reduced ? 0 : FOCUS_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [isInputMode, isVisible, open, reduced]);

  // ── Keyboard lift — direct DOM, no React state ─────────────────────────────
  // When the keyboard opens (e.g. input variant), we lift the card up so it
  // stays centred in the visible area. This used to go through setState which
  // caused a re-render on every viewport event. Now we write transform directly
  // on the wrapper ref — zero React renders during keyboard animation.
  useEffect(() => {
    if (!open) {
      if (keyboardLiftRef.current) {
        keyboardLiftRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      return;
    }

    const applyLift = () => {
      if (!keyboardLiftRef.current) return;

      const vv = window.visualViewport;
      let liftY = 0;

      if (vv) {
        // Центр экрана (где карточка сейчас по CSS)
        const screenCenter = window.innerHeight / 2;
        // Центр видимой области над клавиатурой
        const visibleCenter = vv.offsetTop + vv.height / 2;
        liftY = Math.round(visibleCenter - screenCenter);
      }

      // Fallback для Telegram WebView: --app-keyboard-offset надёжнее visualViewport
      // (telegramViewport.ts вычисляет его через stableViewportHeight - visualBottom)
      if (liftY === 0 && typeof document !== "undefined") {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue("--app-keyboard-offset").trim();
        const offset = parseInt(raw) || 0;
        if (offset > 72) liftY = -Math.round(offset / 2);
      }

      keyboardLiftRef.current.style.transform = `translate3d(0, ${liftY}px, 0)`;
    };

    applyLift();
    window.visualViewport?.addEventListener("resize", applyLift);
    window.visualViewport?.addEventListener("scroll", applyLift);
    // Telegram WebView диспатчит это событие через telegramViewport.ts
    window.addEventListener("app:telegram-viewport-change", applyLift);

    return () => {
      window.visualViewport?.removeEventListener("resize", applyLift);
      window.visualViewport?.removeEventListener("scroll", applyLift);
      window.removeEventListener("app:telegram-viewport-change", applyLift);
      if (keyboardLiftRef.current) {
        keyboardLiftRef.current.style.transform = "translate3d(0, 0, 0)";
      }
    };
  }, [open]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(isInputMode ? inputValue.trim() : undefined);
  }, [canConfirm, inputValue, isInputMode, onConfirm]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key === "Enter") { event.preventDefault(); handleConfirm(); }
    },
    [handleConfirm, onCancel],
  );

  // ── Theme palette ──────────────────────────────────────────────────────────
  const palette = useMemo(() => ({
    cardBackground: themeView.isLight ? "#ffffff" : themeView.cardStrong,
    inputBackground: themeView.isLight ? "rgba(247,247,251,0.96)" : "rgba(255,255,255,0.07)",
    overlayBackground: themeView.isLight ? "rgba(12,13,18,0.26)" : "rgba(0,0,0,0.56)",
    cancelBackground: themeView.isLight ? "rgba(28,28,30,0.06)" : "rgba(255,255,255,0.08)",
    confirmBackground: isDangerMode ? "var(--danger)" : "var(--primary)",
    confirmShadow: isDangerMode
      ? "0 14px 30px rgba(255,69,58,0.24)"
      : "0 14px 30px rgba(119,86,223,0.30)",
  }), [isDangerMode, themeView]);

  if (!shouldRender) return null;

  // Transition strings — applied per-state so open and close have different curves.
  const openMs = reduced ? 0 : OPEN_MS;
  const closeMs = reduced ? 0 : CLOSE_MS;
  const overlayMs = reduced ? 0 : OVERLAY_MS;

  const cardTransition = isVisible
    ? `${THEME_TRANSITION}, opacity ${openMs}ms ${SPRING_EASE}, transform ${openMs}ms ${SPRING_EASE}`
    : `${THEME_TRANSITION}, opacity ${closeMs}ms ${CLOSE_EASE}, transform ${closeMs}ms ${CLOSE_EASE}`;

  const overlayTransition = `${THEME_TRANSITION}, opacity ${overlayMs}ms ease, backdrop-filter ${overlayMs}ms ease`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-alert-title"
      style={alertRootStyle}
      onKeyDown={handleKeyDown}
    >
      {/* Overlay / backdrop */}
      <button
        type="button"
        aria-label="Закрыть окно"
        onClick={onCancel}
        style={{
          ...alertOverlayStyle,
          background: palette.overlayBackground,
          opacity: isVisible ? 1 : 0,
          backdropFilter: isVisible ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: isVisible ? "blur(12px)" : "blur(0px)",
          transition: overlayTransition,
          pointerEvents: open || isVisible ? "auto" : "none",
        }}
      />

      {/* Keyboard lift wrapper — transform set directly via DOM ref */}
      <div ref={keyboardLiftRef} style={keyboardLiftStyle}>
        {/* Card — CSS transition for open/close */}
        <div
          style={{
            ...alertCardStyle,
            background: palette.cardBackground,
            border: `1px solid ${themeView.border}`,
            boxShadow: themeView.isLight
              ? "0 24px 70px rgba(28,28,30,0.18)"
              : "0 24px 70px rgba(0,0,0,0.52)",
            opacity: isVisible ? 1 : 0,
            transform: isVisible
              ? "translate3d(0, 0, 0) scale(1)"
              : "translate3d(0, 18px, 0) scale(0.94)",
            transition: cardTransition,
            pointerEvents: open || isVisible ? "auto" : "none",
          }}
        >
          <div style={alertTextStackStyle}>
            <div id="app-alert-title" style={{ ...alertTitleStyle, color: themeView.textPrimary }}>
              {title}
            </div>
            {message ? (
              <div style={{ ...alertMessageStyle, color: themeView.textSecondary }}>
                {message}
              </div>
            ) : null}
          </div>

          {isInputMode ? (
            <label style={alertInputStackStyle}>
              {inputLabel ? (
                <span style={{ ...alertInputLabelStyle, color: themeView.textSecondary }}>
                  {inputLabel}
                </span>
              ) : null}
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                style={{
                  ...alertInputStyle,
                  background: palette.inputBackground,
                  color: themeView.textPrimary,
                  border: `1px solid ${themeView.border}`,
                }}
              />
            </label>
          ) : null}

          <div style={alertActionsStyle}>
            {variant !== "info" ? (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  ...alertButtonStyle,
                  background: palette.cancelBackground,
                  color: themeView.textPrimary,
                }}
              >
                {cancelText}
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={{
                ...alertButtonStyle,
                background: palette.confirmBackground,
                color: "#ffffff",
                boxShadow: palette.confirmShadow,
                opacity: canConfirm ? 1 : 0.46,
                cursor: canConfirm ? "pointer" : "not-allowed",
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Static styles ────────────────────────────────────────────────────────────
const alertRootStyle: React.CSSProperties = {
  position: "fixed",
  // Центрируем в пределах app-shell (520px max) — иначе на широком PC
  // backdrop и карточка выходят за границы контента
  left: "50%",
  top: 0,
  bottom: 0,
  width: "min(100%, 520px)",
  transform: "translateX(-50%)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: [
    "max(var(--app-home-safe-top, 0px), env(safe-area-inset-top, 18px), 18px)",
    "18px",
    "max(18px, var(--app-tg-safe-bottom, env(safe-area-inset-bottom, 0px)))",
    "18px",
  ].join(" "),
  boxSizing: "border-box",
  pointerEvents: "none",
};

const alertOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  padding: 0,
  cursor: "default",
};

// Outer lift wrapper — keyboard offset is set here via direct DOM ref.
// No transition: the keyboard move is tracked per visualViewport event which
// fires frequently; adding a CSS transition here would add lag.
const keyboardLiftStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "min(100%, 360px)",
  willChange: "transform",
};

const alertCardStyle: React.CSSProperties = {
  borderRadius: 28,
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  boxSizing: "border-box",
  willChange: "opacity, transform",
};

const alertTextStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  textAlign: "center",
};

const alertTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: 20,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.16,
  letterSpacing: "-0.03em",
};

const alertMessageStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.28,
};

const alertInputStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const alertInputLabelStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.bold,
};

const alertInputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 52,
  padding: "0 14px",
  borderRadius: 16,
  outline: "none",
  fontSize: 17,
  fontWeight: ds.weight.semibold,
  boxSizing: "border-box",
  transition: THEME_TRANSITION,
  WebkitUserSelect: "text",
  userSelect: "text",
  touchAction: "manipulation",
};

const alertActionsStyle: React.CSSProperties = {
  display: "grid",
  gridAutoColumns: "1fr",
  gridAutoFlow: "column",
  gap: 10,
};

const alertButtonStyle: React.CSSProperties = {
  minHeight: 48,
  border: "none",
  borderRadius: 16,
  padding: "0 14px",
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.heavy,
  cursor: "pointer",
  transition: `${THEME_TRANSITION}, opacity 150ms ease`,
  WebkitTapHighlightColor: "transparent",
};

export default React.memo(AppAlert);
