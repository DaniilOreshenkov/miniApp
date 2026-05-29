/**
 * CreateProjectScreen — полноэкранная форма создания нового проекта.
 *
 * Состояние формы хранится внутри экрана (не в родителе).
 * Document flow — браузер сам обрабатывает клавиатуру, ноль кастомного кода.
 */

import React, { useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { GridSeed } from "../entities/project/types";

interface Props {
  onClose: () => void;
  onCreate: (seed: GridSeed) => void;
}

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;

const SIZE_PRESETS: Array<{ w: number; h: number }> = [
  { w: 10, h: 10 },
  { w: 20, h: 20 },
  { w: 30, h: 30 },
  { w: 40, h: 40 },
];

type BgOption = { label: string; value: string; isDark?: boolean };

const BG_OPTIONS: BgOption[] = [
  { label: "Белый",       value: "#ffffff" },
  { label: "Жемчуг",     value: "#f5f0e8" },
  { label: "Небесный",   value: "#dceeff" },
  { label: "Лаванда",    value: "#ece4ff" },
  { label: "Мята",       value: "#d4f5e2" },
  { label: "Персик",     value: "#ffe4d4" },
  { label: "Серый",      value: "#e4e4e8" },
  { label: "Тёмный",     value: "#1e2028", isDark: true },
];

const sanitizeNumericInput = (value: string) => value.replace(/\D/g, "");

const isGridValueValid = (value: string) => {
  if (value.trim() === "") return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_GRID_SIZE && n <= MAX_GRID_SIZE;
};

const clampGridValueOnBlur = (value: string) => {
  if (value.trim() === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n < MIN_GRID_SIZE) return String(MIN_GRID_SIZE);
  if (n > MAX_GRID_SIZE) return String(MAX_GRID_SIZE);
  return String(n);
};

/** Рисует сетку поверх превью — CSS repeating-gradient по клеткам. */
const makeGridOverlay = (w: number, h: number, isDark: boolean): string => {
  const lineColor = isDark
    ? "rgba(255,255,255,0.10)"
    : "rgba(0,0,0,0.06)";

  // Нормируем к размеру превью (320 × 160) для читаемой сетки
  const PREVIEW_W = 320;
  const PREVIEW_H = 160;
  const cellW = Math.max(4, Math.round(PREVIEW_W / w));
  const cellH = Math.max(4, Math.round(PREVIEW_H / h));

  return [
    `repeating-linear-gradient(to right, ${lineColor} 0px, ${lineColor} 1px, transparent 1px, transparent ${cellW}px)`,
    `repeating-linear-gradient(to bottom, ${lineColor} 0px, ${lineColor} 1px, transparent 1px, transparent ${cellH}px)`,
  ].join(", ");
};

const CreateProjectScreen: React.FC<Props> = ({ onClose, onCreate }) => {
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth]   = useState("");
  const [gridHeight, setGridHeight] = useState("");
  const [bgColor, setBgColor]       = useState(BG_OPTIONS[0].value);

  const nameInputRef   = useRef<HTMLInputElement | null>(null);
  const widthInputRef  = useRef<HTMLInputElement | null>(null);
  const heightInputRef = useRef<HTMLInputElement | null>(null);

  const isNameValid   = projectName.trim().length > 0;
  const isWidthValid  = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isDisabled    = !isNameValid || !isWidthValid || !isHeightValid;

  const w = isWidthValid  ? Number(gridWidth)  : 20;
  const h = isHeightValid ? Number(gridHeight) : 20;

  const selectedBg = BG_OPTIONS.find((o) => o.value === bgColor) ?? BG_OPTIONS[0];

  const applyPreset = (pw: number, ph: number) => {
    setGridWidth(String(pw));
    setGridHeight(String(ph));
  };

  const handleCreate = () => {
    if (isDisabled) return;
    onCreate({
      name: projectName.trim(),
      width: Number(gridWidth),
      height: Number(gridHeight),
      backgroundColor: bgColor,
    });
  };

  const gridOverlay = makeGridOverlay(w, h, selectedBg.isDark ?? false);

  return (
    <div style={rootStyle}>
      {/* ── Top bar ── */}
      <div style={topBarStyle}>
        <button type="button" style={backButtonStyle} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={topBarTitleStyle}>Новый проект</div>
        <div style={topBarSpacerStyle} />
      </div>

      {/* ── Scrollable content ── */}
      <div style={scrollStyle} className="app-scroll">

        {/* Live превью сетки */}
        <div style={{ ...previewCardStyle, background: bgColor }}>
          {/* Сетка */}
          <div style={{ ...previewGridOverlayStyle, background: gridOverlay }} />

          {/* Размеры в углу */}
          <div style={{
            ...previewBadgeStyle,
            background: selectedBg.isDark
              ? "rgba(255,255,255,0.15)"
              : "rgba(0,0,0,0.10)",
            color: selectedBg.isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.55)",
          }}>
            {isWidthValid && isHeightValid ? `${w} × ${h}` : "— × —"}
          </div>

          {/* Центральный плейсхолдер когда ничего не выбрано */}
          {(!isWidthValid || !isHeightValid) && (
            <div style={{
              ...previewPlaceholderStyle,
              color: selectedBg.isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.18)",
            }}>
              Выберите размер сетки
            </div>
          )}
        </div>

        {/* ── Имя проекта ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Имя проекта</div>
          <input
            ref={nameInputRef}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                widthInputRef.current?.focus();
              }
            }}
            placeholder="Введите имя проекта"
            enterKeyHint="next"
            autoComplete="off"
            style={{
              ...inputStyle,
              border: isNameValid || projectName === ""
                ? `1px solid ${ds.color.border}`
                : `1px solid ${ds.color.danger}`,
            }}
          />
        </div>

        {/* ── Размер ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Размер сетки</div>

          {/* Пресеты */}
          <div style={presetsRowStyle}>
            {SIZE_PRESETS.map((preset) => {
              const isActive =
                gridWidth === String(preset.w) && gridHeight === String(preset.h);
              return (
                <button
                  key={`${preset.w}x${preset.h}`}
                  type="button"
                  style={{
                    ...presetButtonStyle,
                    ...(isActive ? presetButtonActiveStyle : null),
                  }}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => applyPreset(preset.w, preset.h)}
                >
                  {preset.w}×{preset.h}
                </button>
              );
            })}
          </div>

          {/* Инпуты Ш × Д */}
          <div style={sizeRowStyle}>
            <div style={sizeFieldStyle}>
              <div style={sizeLabelStyle}>Ширина</div>
              <input
                ref={widthInputRef}
                value={gridWidth}
                onChange={(e) => setGridWidth(sanitizeNumericInput(e.target.value))}
                onBlur={() => setGridWidth((p) => clampGridValueOnBlur(p))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.focus(); }
                }}
                inputMode="numeric"
                enterKeyHint="next"
                pattern="[0-9]*"
                placeholder="20"
                style={{
                  ...inputStyle,
                  textAlign: "center",
                  border: gridWidth === "" || isWidthValid
                    ? `1px solid ${ds.color.border}`
                    : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>

            <div style={sizeSeparatorStyle}>×</div>

            <div style={sizeFieldStyle}>
              <div style={sizeLabelStyle}>Длина</div>
              <input
                ref={heightInputRef}
                value={gridHeight}
                onChange={(e) => setGridHeight(sanitizeNumericInput(e.target.value))}
                onBlur={() => setGridHeight((p) => clampGridValueOnBlur(p))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.blur(); }
                }}
                inputMode="numeric"
                enterKeyHint="done"
                pattern="[0-9]*"
                placeholder="20"
                style={{
                  ...inputStyle,
                  textAlign: "center",
                  border: gridHeight === "" || isHeightValid
                    ? `1px solid ${ds.color.border}`
                    : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>
          </div>
          <div style={hintStyle}>от 1 до 100 по каждой стороне</div>
        </div>

        {/* ── Фон ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Фон сетки</div>
          <div style={bgGridStyle}>
            {BG_OPTIONS.map((opt) => {
              const isActive = bgColor === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.label}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setBgColor(opt.value)}
                  style={{
                    ...bgSwatchStyle,
                    background: opt.value,
                    boxShadow: isActive
                      ? `0 0 0 2.5px var(--bg), 0 0 0 5px var(--primary)`
                      : `0 0 0 1px rgba(0,0,0,0.08)`,
                    transform: isActive ? "scale(1.12)" : "scale(1)",
                  }}
                  aria-pressed={isActive}
                  aria-label={opt.label}
                />
              );
            })}
          </div>
          <div style={bgSelectedLabelStyle}>{selectedBg.label}</div>
        </div>

        {/* ── Кнопка ── */}
        <button
          type="button"
          style={{
            ...createButtonStyle,
            opacity: isDisabled ? 0.48 : 1,
            cursor: isDisabled ? "not-allowed" : "pointer",
          }}
          onClick={handleCreate}
          disabled={isDisabled}
        >
          Создать проект
        </button>

        <div style={safeBottomStyle} />
      </div>
    </div>
  );
};

export default CreateProjectScreen;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  overflowY: "hidden",
};

const topBarStyle: React.CSSProperties = {
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

const backButtonStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.md,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const topBarTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  letterSpacing: -0.2,
  textAlign: "center",
};

const topBarSpacerStyle: React.CSSProperties = {
  width: 40,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: 24,
  padding: "20px 18px 0",
  boxSizing: "border-box",
};

/* ── Preview ── */

const previewCardStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 176,
  borderRadius: 24,
  overflow: "hidden",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 200ms ease",
};

const previewGridOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const previewBadgeStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  right: 12,
  padding: "5px 10px",
  borderRadius: 10,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  letterSpacing: 0.2,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  transition: "background 200ms ease, color 200ms ease",
};

const previewPlaceholderStyle: React.CSSProperties = {
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.medium,
  textAlign: "center",
  pointerEvents: "none",
  transition: "color 200ms ease",
};

/* ── Sections ── */

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
};

const hintStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: ds.font.caption,
  lineHeight: 1.3,
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

/* ── Size presets ── */

const presetsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const presetButtonStyle: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: ds.radius.pill,
  border: `1px solid ${ds.color.border}`,
  background: ds.color.surfaceSoft,
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.bold,
  cursor: "pointer",
  touchAction: "manipulation",
  transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
};

const presetButtonActiveStyle: React.CSSProperties = {
  background: ds.color.primaryButtonBg,
  color: ds.color.primaryButtonText,
  border: "1px solid transparent",
};

/* ── Custom size inputs ── */

const sizeRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
};

const sizeFieldStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sizeLabelStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodySm,
  fontWeight: ds.weight.medium,
};

const sizeSeparatorStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: 22,
  fontWeight: ds.weight.semibold,
  paddingBottom: 12,
  flexShrink: 0,
};

/* ── Background color picker ── */

const bgGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};

const bgSwatchStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  cursor: "pointer",
  border: "none",
  flexShrink: 0,
  transition: "transform 200ms cubic-bezier(0.34, 1.5, 0.64, 1), box-shadow 200ms ease",
};

const bgSelectedLabelStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodySm,
  fontWeight: ds.weight.medium,
  marginTop: -2,
};

/* ── Create button ── */

const createButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  boxShadow: ds.shadow.button,
};

const safeBottomStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "max(20px, env(safe-area-inset-bottom, 12px))",
};
