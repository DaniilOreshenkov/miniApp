/**
 * CreateProjectScreen — полноэкранная форма создания нового проекта.
 */

import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { GridSeed } from "../entities/project/types";

/* ─── Recent colors ─────────────────────────────────────────────────────── */

const RECENT_COLORS_KEY = "beadly-recent-colors-v1";
const DEFAULT_COLORS    = ["#ffffff", "#111111", "#ff3b30", "#007aff", "#34c759", "#ffcc00", "#ff9500", "#af52de"];

const loadRecentColors = (): string[] => {
  try {
    const raw = window.localStorage.getItem(RECENT_COLORS_KEY);
    if (!raw) return DEFAULT_COLORS;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string") && parsed.length > 0)
      return parsed.slice(0, 10);
  } catch { /* ignore */ }
  return DEFAULT_COLORS;
};

const saveRecentColors = (colors: string[]) => {
  try { window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors)); } catch { /* ignore */ }
};

const norm = (c: string) => c.trim().toLowerCase();

/* ─── Grid drawing ──────────────────────────────────────────────────────── */

/**
 * Точная копия алгоритма из CanvasGrid.tsx:
 *
 *   rowCount    = safeHeight * 2 + 1
 *   maxRowLen   = safeWidth  + 1
 *   even row (index % 2 === 1): w+1 beads, startX = 0
 *   odd  row (index % 2 === 0): w   beads, startX = xStep/2
 *
 *   bead=24, gap=6, stretchX=1.12
 *   xStep = (bead+gap) * stretchX       ≈ 33.6
 *   yStep = sqrt(bead²-(xStep/2)²)      ≈ 17.14
 *
 *   boardWidth  = maxRowLen*xStep + bead  (= safeWidth*xStep + bead)  — точнее: (maxRowLen-1)*xStep+bead
 *   boardHeight = (rowCount-1)*yStep + bead
 */
const drawPreview = (
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  bgColor: string,
  bgImage: HTMLImageElement | null,
) => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw  = canvas.offsetWidth;
  const ch  = canvas.offsetHeight;
  if (cw === 0 || ch === 0) return;
  canvas.width  = cw * dpr;
  canvas.height = ch * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // ── Фон ──
  ctx.fillStyle = bgColor || "#ffffff";
  ctx.fillRect(0, 0, cw, ch);

  if (bgImage) {
    const sc = Math.max(cw / bgImage.naturalWidth, ch / bgImage.naturalHeight);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(bgImage,
      (cw - bgImage.naturalWidth  * sc) / 2,
      (ch - bgImage.naturalHeight * sc) / 2,
      bgImage.naturalWidth  * sc,
      bgImage.naturalHeight * sc,
    );
    ctx.globalAlpha = 1;
  }

  // ── Параметры из CanvasGrid ──
  const BEAD   = 24;
  const GAP    = 6;
  const STR    = 1.12;
  const xStep  = (BEAD + GAP) * STR;
  const yStep  = Math.sqrt(BEAD * BEAD - (xStep / 2) ** 2);

  const safeW     = w;
  const safeH     = h;
  const rowCount  = safeH * 2 + 1;
  const maxRowLen = safeW + 1;

  const boardW = (maxRowLen - 1) * xStep + BEAD;
  const boardH = (rowCount   - 1) * yStep + BEAD;

  const PAD   = 4;
  const scale = Math.min((cw - PAD * 2) / boardW, (ch - PAD * 2) / boardH);

  const r  = (BEAD / 2) * scale;
  const sy = yStep * scale;

  const ox = (cw - boardW * scale) / 2;
  const oy = (ch - boardH * scale) / 2;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const rowLen    = rowIndex % 2 === 0 ? safeW : maxRowLen;   // чётные=w, нечётные=w+1
    const rowStartX = rowLen === maxRowLen ? 0 : xStep / 2;     // как в редакторе

    for (let col = 0; col < rowLen; col++) {
      const cx = ox + (rowStartX + col * xStep) * scale + r;
      const cy = oy + rowIndex * sy + r;

      const vr = r * 0.82;

      ctx.beginPath();
      ctx.arc(cx, cy, vr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.34)";
      ctx.fill();
      ctx.lineWidth = Math.max(0.6, scale * 0.9);
      ctx.strokeStyle = "rgba(17,17,17,0.12)";
      ctx.stroke();
    }
  }
};

/* ─── Props / constants ─────────────────────────────────────────────────── */

interface Props {
  onClose: () => void;
  onCreate: (seed: GridSeed) => void;
}

const MIN = 1;
const MAX = 100;

const sanitize = (v: string) => v.replace(/\D/g, "");

const isValid = (v: string) => {
  if (!v.trim()) return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= MIN && n <= MAX;
};

const clamp = (v: string) => {
  if (!v.trim()) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(MAX, Math.max(MIN, n)));
};

/* ─── Component ─────────────────────────────────────────────────────────── */

const CreateProjectScreen: React.FC<Props> = ({ onClose, onCreate }) => {
  const [name,         setName]         = useState("");
  const [width,        setWidth]        = useState("");
  const [height,       setHeight]       = useState("");
  const [bgColor,      setBgColor]      = useState("#ffffff");
  const [bgImageUrl,   setBgImageUrl]   = useState<string | null>(null);
  const [colorOpen,    setColorOpen]    = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>(loadRecentColors);

  const nameRef   = useRef<HTMLInputElement | null>(null);
  const widthRef  = useRef<HTMLInputElement | null>(null);
  const heightRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef  = useRef<HTMLImageElement | null>(null);

  const wOk = isValid(width);
  const hOk = isValid(height);
  const w   = wOk ? Number(width)  : 20;
  const h   = hOk ? Number(height) : 20;

  const isDisabled = !name.trim() || !wOk || !hOk;

  /* Загружаем картинку в Image-объект при смене URL */
  useEffect(() => {
    if (!bgImageUrl) { bgImgRef.current = null; return; }
    const img = new Image();
    img.onload = () => { bgImgRef.current = img; redraw(); };
    img.src = bgImageUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgImageUrl]);

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    drawPreview(canvasRef.current, w, h, bgColor, bgImgRef.current);
  }, [w, h, bgColor]);

  /* Перерисовываем при любом изменении параметров */
  useEffect(() => { redraw(); }, [redraw]);

  /* После монтирования canvas-элемента (wOk && hOk стали true) — сразу рисуем */
  useLayoutEffect(() => {
    if (wOk && hOk) redraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wOk, hOk]);

  /* ── Handlers ── */

  const selectColor = (color: string) => {
    setBgColor(color);
    setRecentColors((prev) => {
      const n2   = norm(color);
      const next = [n2, ...prev.filter((c) => norm(c) !== n2)].slice(0, 10);
      saveRecentColors(next);
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
    e.target.value = "";
  }, []);

  const handleCreate = () => {
    if (isDisabled) return;
    onCreate({
      name: name.trim(),
      width: Number(width),
      height: Number(height),
      backgroundColor: bgColor,
      backgroundImageUrl: bgImageUrl ?? undefined,
    });
  };

  /* ── Render ── */
  return (
    <div style={rootStyle}>

      {/* Top bar */}
      <div style={topBarStyle}>
        <button type="button" style={backBtnStyle} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={topTitleStyle}>Новый проект</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Scroll */}
      <div style={scrollStyle} className="app-scroll">

        {/* Live превью — скруглённый прямоугольник */}
        <div style={previewWrapStyle}>
          {wOk && hOk ? (
            <canvas ref={canvasRef} style={previewCanvasStyle} />
          ) : (
            <div style={previewEmptyStyle} />
          )}
        </div>

        {/* Имя */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Имя проекта</div>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); widthRef.current?.focus(); } }}
            placeholder="Введите имя"
            enterKeyHint="next"
            autoComplete="off"
            style={{
              ...inputStyle,
              border: name && !name.trim() ? `1px solid ${ds.color.danger}` : `1px solid ${ds.color.border}`,
            }}
          />
        </div>

        {/* Размер */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Размер сетки</div>

          <div style={sizeRowStyle}>
            <div style={sizeFieldStyle}>
              <div style={sizeLabelStyle}>Ширина</div>
              <input
                ref={widthRef}
                value={width}
                onChange={(e) => setWidth(sanitize(e.target.value))}
                onBlur={() => setWidth((v) => clamp(v))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.focus(); } }}
                inputMode="numeric"
                enterKeyHint="next"
                pattern="[0-9]*"
                placeholder="20"
                style={{
                  ...inputStyle,
                  textAlign: "center",
                  border: !width || wOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>

            <div style={sizeSepStyle}>×</div>

            <div style={sizeFieldStyle}>
              <div style={sizeLabelStyle}>Длина</div>
              <input
                ref={heightRef}
                value={height}
                onChange={(e) => setHeight(sanitize(e.target.value))}
                onBlur={() => setHeight((v) => clamp(v))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.blur(); } }}
                inputMode="numeric"
                enterKeyHint="done"
                pattern="[0-9]*"
                placeholder="20"
                style={{
                  ...inputStyle,
                  textAlign: "center",
                  border: !height || hOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>
          </div>
          <div style={hintStyle}>от 1 до 100</div>
        </div>

        {/* Фон */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Фон сетки</div>

          {/* Две кнопки */}
          <div style={bgBtnsRowStyle}>
            {/* Цвет */}
            <button
              type="button"
              style={{ ...bgBtnStyle, ...(colorOpen ? bgBtnActiveStyle : null) }}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setColorOpen((v) => !v)}
            >
              <span style={{ ...bgBtnDotStyle, background: bgColor,
                border: bgColor === "#ffffff" || bgColor === "#f2f2f7"
                  ? "1.5px solid rgba(0,0,0,0.12)"
                  : "1.5px solid rgba(255,255,255,0.2)",
              }} />
              Цвет
            </button>

            {/* Импорт */}
            <label style={bgBtnStyle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Импорт
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={handleBgImageChange}
                style={hiddenInputStyle}
              />
            </label>

            {/* Сброс картинки */}
            {bgImageUrl && (
              <button
                type="button"
                style={bgBtnStyle}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setBgImageUrl(null)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 3v5h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Сброс
              </button>
            )}
          </div>

          {/* Цветовой пикер — появляется по нажатию «Цвет» */}
          {colorOpen && (
            <div style={colorPanelStyle}>
              {/* Текущий цвет + кнопка Свой */}
              <div style={colorCurrentRowStyle}>
                <div style={colorCurrentInfoStyle}>
                  <div style={{
                    ...colorPreviewStyle,
                    background: bgColor,
                    border: bgColor === "#ffffff" || bgColor === "#f2f2f7"
                      ? "1.5px solid rgba(0,0,0,0.10)"
                      : "1.5px solid rgba(255,255,255,0.18)",
                  }} />
                  <div style={colorHexStyle}>{bgColor.toUpperCase()}</div>
                </div>

                <label style={colorCustomBtnStyle}>
                  Свой
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => selectColor(e.target.value)}
                    style={hiddenInputStyle}
                  />
                </label>
              </div>

              {/* Сетка последних цветов */}
              <div style={colorGridStyle}>
                {recentColors.map((color) => {
                  const n2     = norm(color);
                  const active = norm(bgColor) === n2;
                  const light  = n2 === "#ffffff" || n2 === "#f2f2f7" || n2 === "#ffcc00";
                  return (
                    <button
                      key={n2}
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => selectColor(n2)}
                      style={{
                        ...colorDotBtnStyle,
                        background: n2,
                        border: active
                          ? "2.5px solid #d9825f"
                          : light
                            ? "1px solid rgba(0,0,0,0.16)"
                            : "1px solid rgba(255,255,255,0.12)",
                        boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Кнопка создать */}
        <button
          type="button"
          style={{ ...createBtnStyle, opacity: isDisabled ? 0.48 : 1, cursor: isDisabled ? "not-allowed" : "pointer" }}
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

const backBtnStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.md,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const topTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  letterSpacing: -0.2,
  textAlign: "center",
};

/* Preview */
const previewWrapStyle: React.CSSProperties = {
  width: "100%",
  height: 200,
  borderRadius: 24,
  overflow: "hidden",
  flexShrink: 0,
  border: `1px solid ${ds.color.border}`,
};

const previewCanvasStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

const previewEmptyStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: ds.color.surfaceSoft,
};

/* Scroll */
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
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

/* Size inputs */
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

const sizeSepStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: 22,
  fontWeight: ds.weight.semibold,
  paddingBottom: 12,
  flexShrink: 0,
};

/* Background buttons */
const bgBtnsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const bgBtnStyle: React.CSSProperties = {
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
  gap: 7,
  position: "relative",
  overflow: "hidden",
  WebkitTapHighlightColor: "transparent",
  flexShrink: 0,
};

const bgBtnActiveStyle: React.CSSProperties = {
  background: ds.color.surfaceElevated,
  border: `1px solid ${ds.color.borderStrong}`,
  color: ds.color.textPrimary,
};

const bgBtnDotStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 6,
  flexShrink: 0,
};

const hiddenInputStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
};

/* Color picker panel */
const colorPanelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const colorCurrentRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const colorCurrentInfoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const colorPreviewStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 16,
  flexShrink: 0,
  boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
};

const colorHexStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.35,
};

const colorCustomBtnStyle: React.CSSProperties = {
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

const colorGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 44px)",
  justifyContent: "space-between",
  gap: 8,
};

const colorDotBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  padding: 0,
  cursor: "pointer",
  transition: "box-shadow 140ms ease, border 140ms ease",
  WebkitTapHighlightColor: "transparent",
};

/* Create button */
const createBtnStyle: React.CSSProperties = {
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
