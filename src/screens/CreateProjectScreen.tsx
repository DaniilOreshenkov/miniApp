/**
 * CreateProjectScreen — полноэкранная форма создания нового проекта.
 *
 * Состояние формы хранится внутри экрана (не в родителе).
 * Document flow — браузер сам обрабатывает клавиатуру, ноль кастомного кода.
 */

import React, { useRef, useState, useCallback } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { GridSeed } from "../entities/project/types";

const RECENT_COLORS_STORAGE_KEY = "beadly-recent-colors-v1";
const DEFAULT_BG_COLORS = ["#ffffff", "#111111", "#ff3b30", "#007aff", "#34c759", "#ffcc00", "#ff9500", "#af52de"];

const getStoredRecentColors = (): string[] => {
  try {
    const raw = window.localStorage.getItem(RECENT_COLORS_STORAGE_KEY);
    if (!raw) return DEFAULT_BG_COLORS;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string") && parsed.length > 0) {
      return parsed.slice(0, 10);
    }
  } catch { /* ignore */ }
  return DEFAULT_BG_COLORS;
};

const normalizeColor = (c: string) => c.trim().toLowerCase();

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
  const [gridWidth, setGridWidth]     = useState("");
  const [gridHeight, setGridHeight]   = useState("");
  const [bgColor, setBgColor]           = useState("#ffffff");
  const [bgImageUrl, setBgImageUrl]     = useState<string | null>(null);
  const [recentColors, setRecentColors] = useState<string[]>(getStoredRecentColors);

  const nameInputRef   = useRef<HTMLInputElement | null>(null);
  const widthInputRef  = useRef<HTMLInputElement | null>(null);
  const heightInputRef = useRef<HTMLInputElement | null>(null);

  const isNameValid   = projectName.trim().length > 0;
  const isWidthValid  = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isDisabled    = !isNameValid || !isWidthValid || !isHeightValid;

  const handleSelectColor = (color: string) => {
    setBgColor(color);
    setRecentColors((prev) => {
      const norm = normalizeColor(color);
      const next = [norm, ...prev.filter((c) => normalizeColor(c) !== norm)].slice(0, 10);
      try { window.localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleBgImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result;
      if (typeof url === "string") setBgImageUrl(url);
    };
    reader.readAsDataURL(file);
    // сброс инпута чтобы можно было выбрать тот же файл повторно
    e.target.value = "";
  }, []);

  const handleResetBg = useCallback(() => {
    setBgImageUrl(null);
  }, []);

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
      backgroundImageUrl: bgImageUrl ?? undefined,
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

      {/* ── Scrollable content ── */}
      <div style={scrollStyle} className="app-scroll">

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

          {/* Превью фона */}
          <div style={{
            ...bgPreviewCardStyle,
            background: bgColor,
          }}>
            {bgImageUrl && (
              <img
                src={bgImageUrl}
                alt="Фон"
                style={bgPreviewImageStyle}
              />
            )}
          </div>

          {/* Кнопки Импорт / Сброс */}
          <div style={bgActionsRowStyle}>
            <label style={bgActionButtonStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Импорт
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={handleBgImageChange}
                style={hiddenFileInputStyle}
                aria-label="Импортировать фоновое изображение"
              />
            </label>

            {bgImageUrl && (
              <button
                type="button"
                style={bgActionButtonStyle}
                onClick={handleResetBg}
                aria-label="Сбросить фон"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Сброс
              </button>
            )}
          </div>

          {/* Текущий цвет + кнопка «Свой» — как в редакторе */}
          <div style={bgCurrentRowStyle}>
            <div style={bgCurrentInfoStyle}>
              <div style={{
                ...bgPreviewStyle,
                background: bgColor,
                border: bgColor === "#ffffff" || bgColor === "#f2f2f7"
                  ? "1.5px solid rgba(0,0,0,0.10)"
                  : "1.5px solid rgba(255,255,255,0.18)",
              }} />
              <div style={bgHexLabelStyle}>{bgColor.toUpperCase()}</div>
            </div>

            <label style={bgCustomButtonStyle}>
              Свой
              <input
                type="color"
                value={bgColor}
                onChange={(e) => handleSelectColor(e.target.value)}
                style={bgCustomInputStyle}
                aria-label="Выбрать свой цвет фона"
              />
            </label>
          </div>

          {/* Сетка недавних / пресет цветов */}
          <div style={bgColorsGridStyle}>
            {recentColors.map((color) => {
              const norm = normalizeColor(color);
              const isActive = normalizeColor(bgColor) === norm;
              const isLight = norm === "#ffffff" || norm === "#f2f2f7" || norm === "#ffcc00";
              return (
                <button
                  key={norm}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectColor(norm)}
                  style={{
                    ...bgColorButtonStyle,
                    background: norm,
                    border: isActive
                      ? "2.5px solid #d9825f"
                      : isLight
                        ? "1px solid rgba(0,0,0,0.16)"
                        : "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                  }}
                  aria-label={`Цвет фона ${norm}`}
                  aria-pressed={isActive}
                />
              );
            })}
          </div>
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

/* ── Background preview ── */

const bgPreviewCardStyle: React.CSSProperties = {
  width: "100%",
  height: 160,
  borderRadius: 20,
  overflow: "hidden",
  flexShrink: 0,
  position: "relative",
  transition: "background 180ms ease",
  border: `1px solid ${ds.color.border}`,
};

const bgPreviewImageStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const bgActionsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const bgActionButtonStyle: React.CSSProperties = {
  height: 40,
  padding: "0 16px",
  borderRadius: ds.radius.pill,
  border: `1px solid ${ds.color.border}`,
  background: ds.color.surfaceSoft,
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  position: "relative",
  overflow: "hidden",
  WebkitTapHighlightColor: "transparent",
};

const hiddenFileInputStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
};

/* ── Background color picker ── */

const bgCurrentRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 10,
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const bgCurrentInfoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const bgPreviewStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 16,
  boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
  flexShrink: 0,
  transition: "background 160ms ease",
};

const bgHexLabelStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.35,
};

const bgCustomButtonStyle: React.CSSProperties = {
  position: "relative",
  height: 42,
  minWidth: 72,
  padding: "0 14px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "linear-gradient(135deg, rgba(217,130,95,0.96), rgba(184,93,106,0.96))",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  WebkitTapHighlightColor: "transparent",
  flexShrink: 0,
};

const bgCustomInputStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
};

const bgColorsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 44px)",
  justifyContent: "space-between",
  gap: 8,
};

const bgColorButtonStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: 999,
  padding: 0,
  cursor: "pointer",
  transition: "box-shadow 160ms ease, border 160ms ease",
  WebkitTapHighlightColor: "transparent",
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
