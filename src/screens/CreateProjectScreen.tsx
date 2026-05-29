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

const CreateProjectScreen: React.FC<Props> = ({ onClose, onCreate }) => {
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth] = useState("");
  const [gridHeight, setGridHeight] = useState("");

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const widthInputRef = useRef<HTMLInputElement | null>(null);
  const heightInputRef = useRef<HTMLInputElement | null>(null);

  const isNameValid = projectName.trim().length > 0;
  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isDisabled = !isNameValid || !isWidthValid || !isHeightValid;

  const applyPreset = (w: number, h: number) => {
    setGridWidth(String(w));
    setGridHeight(String(h));
  };

  const handleCreate = () => {
    if (isDisabled) return;
    onCreate({
      name: projectName.trim(),
      width: Number(gridWidth),
      height: Number(gridHeight),
    });
  };

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

      {/* ── Scrollable content — document flow, клавиатура работает сама ── */}
      <div style={scrollStyle}>

        {/* Имя проекта */}
        <div style={fieldStackStyle}>
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

        {/* Пресеты размеров */}
        <div style={fieldStackStyle}>
          <div style={labelStyle}>Размер</div>
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
        </div>

        {/* Ширина / Длина */}
        <div style={fieldRowStyle}>
          <div style={fieldStackStyle}>
            <div style={labelStyle}>Ширина</div>
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
              placeholder="30"
              style={{
                ...inputStyle,
                border: gridWidth === "" || isWidthValid
                  ? `1px solid ${ds.color.border}`
                  : `1px solid ${ds.color.danger}`,
              }}
            />
            <div style={hintStyle}>от 1 до 100, по крестикам</div>
          </div>

          <div style={fieldStackStyle}>
            <div style={labelStyle}>Длина</div>
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
              placeholder="30"
              style={{
                ...inputStyle,
                border: gridHeight === "" || isHeightValid
                  ? `1px solid ${ds.color.border}`
                  : `1px solid ${ds.color.danger}`,
              }}
            />
            <div style={hintStyle}>от 1 до 100, по крестикам</div>
          </div>
        </div>

        {/* Кнопка */}
        <button
          type="button"
          style={{
            ...createButtonStyle,
            opacity: isDisabled ? 0.5 : 1,
            cursor: isDisabled ? "not-allowed" : "pointer",
          }}
          onClick={handleCreate}
          disabled={isDisabled}
        >
          Создать
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
  gap: 20,
  padding: "20px 18px 0",
  boxSizing: "border-box",
};

const fieldStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const fieldRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
};

const hintStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: ds.font.caption,
  lineHeight: 1.2,
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

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

const createButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  marginTop: 4,
  boxShadow: ds.shadow.button,
};

const safeBottomStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "max(20px, env(safe-area-inset-bottom, 12px))",
};
