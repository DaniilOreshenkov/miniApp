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

const ThemedAlert: React.FC<Props> = ({
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const themeView = getThemeView(theme);
  const isInputMode = variant === "input";
  const isDangerMode = variant === "danger";
  const canConfirm = !isInputMode || inputValue.trim().length > 0;

  useEffect(() => {
    if (!open) return;

    setInputValue(value);
  }, [open, value]);

  useEffect(() => {
    if (!open || !isInputMode) return;

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);

    return () => window.clearTimeout(focusTimer);
  }, [isInputMode, open]);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;

    onConfirm(isInputMode ? inputValue.trim() : undefined);
  }, [canConfirm, inputValue, isInputMode, onConfirm]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleConfirm();
      }
    },
    [handleConfirm, onCancel],
  );

  const palette = useMemo(() => {
    const cardBackground = themeView.isLight ? "#ffffff" : themeView.cardStrong;
    const inputBackground = themeView.isLight
      ? "rgba(247,247,251,0.96)"
      : "rgba(255,255,255,0.07)";
    const overlayBackground = themeView.isLight
      ? "rgba(12,13,18,0.26)"
      : "rgba(0,0,0,0.56)";

    return {
      cardBackground,
      inputBackground,
      overlayBackground,
      cancelBackground: themeView.isLight
        ? "rgba(28,28,30,0.06)"
        : "rgba(255,255,255,0.08)",
      confirmBackground: isDangerMode ? "var(--danger)" : "var(--primary)",
      confirmShadow: isDangerMode
        ? "0 14px 30px rgba(255,69,58,0.24)"
        : "0 14px 30px rgba(119,86,223,0.30)",
    };
  }, [isDangerMode, themeView]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="themed-alert-title"
      style={alertRootStyle}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-label="Закрыть окно"
        onClick={onCancel}
        style={{
          ...alertOverlayStyle,
          background: palette.overlayBackground,
        }}
      />

      <div
        style={{
          ...alertCardStyle,
          background: palette.cardBackground,
          border: `1px solid ${themeView.border}`,
          boxShadow: themeView.isLight
            ? "0 24px 70px rgba(28,28,30,0.18)"
            : "0 24px 70px rgba(0,0,0,0.52)",
        }}
      >
        <div style={alertTextStackStyle}>
          <div
            id="themed-alert-title"
            style={{ ...alertTitleStyle, color: themeView.textPrimary }}
          >
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
              onChange={(event) => setInputValue(event.target.value)}
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
  );
};

const alertRootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "max(18px, env(safe-area-inset-top, 0px)) 18px max(18px, env(safe-area-inset-bottom, 0px))",
  boxSizing: "border-box",
};

const alertOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  padding: 0,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  transition: THEME_TRANSITION,
  cursor: "default",
};

const alertCardStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "min(100%, 360px)",
  borderRadius: 28,
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  boxSizing: "border-box",
  transform: "translate3d(0, 0, 0)",
  transition: THEME_TRANSITION,
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
  transition: THEME_TRANSITION,
  WebkitTapHighlightColor: "transparent",
};

export default React.memo(ThemedAlert);
