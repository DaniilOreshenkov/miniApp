/**
 * CreateProjectScreen — полноэкранная форма создания нового проекта.
 */

import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { GridSeed } from "../entities/project/types";
import { getActivePlan } from "../entities/subscription/plans";

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
  beadColor: string,
) => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw  = canvas.offsetWidth;
  const ch  = canvas.offsetHeight;
  if (cw === 0 || ch === 0 || w <= 0 || h <= 0) return;
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

  // Масштаб: при маленьких сетках бусины крупные (max r=7), при больших — уменьшаются чтобы влезть.
  const PAD     = 8;
  const MAX_R   = 7;
  const fitScale  = Math.min((cw - PAD * 2) / boardW, (ch - PAD * 2) / boardH);
  const maxScale  = (MAX_R * 2) / BEAD;
  const scale     = Math.min(fitScale, maxScale);
  const r         = (BEAD / 2) * scale;
  const sy        = yStep * scale;

  const ox = (cw - boardW * scale) / 2;
  const oy = (ch - boardH * scale) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip();

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const rowLen    = rowIndex % 2 === 0 ? safeW : maxRowLen;
    const rowStartX = rowLen === maxRowLen ? 0 : xStep / 2;

    for (let col = 0; col < rowLen; col++) {
      const cx = ox + (rowStartX + col * xStep) * scale + r;
      const cy = oy + rowIndex * sy + r;

      // Пропускаем бусины полностью за пределами canvas
      if (cx + r < 0 || cx - r > cw || cy + r < 0 || cy - r > ch) continue;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = beadColor || "#f4f5f7";
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = beadColor ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.10)";
      ctx.stroke();
    }
  }

  ctx.restore();
};

/* ─── Props / constants ─────────────────────────────────────────────────── */

interface Props {
  onClose: () => void;
  onCreate: (seed: GridSeed) => void;
  onOpenPaywall?: (feature?: string) => void;
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

const CreateProjectScreen: React.FC<Props> = ({ onClose, onCreate, onOpenPaywall }) => {
  const plan = getActivePlan();
  const canBg    = plan.canBg;
  const canBeads = plan.canBg;

  const [name,         setName]         = useState("");
  const [width,        setWidth]        = useState("1");
  const [height,       setHeight]       = useState("1");
  const [bgColor,        setBgColor]        = useState("#ffffff");
  const [bgImageUrl,     setBgImageUrl]     = useState<string | null>(null);
  const [beadColor,      setBeadColor]      = useState("");
  const [colorOpen,      setColorOpen]      = useState(false);
  const [beadColorOpen,  setBeadColorOpen]  = useState(false);
  const [recentColors,   setRecentColors]   = useState<string[]>(loadRecentColors);

  const nameRef   = useRef<HTMLInputElement | null>(null);
  const widthRef  = useRef<HTMLInputElement | null>(null);
  const heightRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef  = useRef<HTMLImageElement | null>(null);

  const wOk = isValid(width);
  const hOk = isValid(height);
  const w   = wOk ? Number(width)  : 0;
  const h   = hOk ? Number(height) : 0;

  const isDisabled = !name.trim() || !wOk || !hOk;

  /* Загружаем картинку в Image-объект при смене URL */
  useEffect(() => {
    if (!bgImageUrl) { bgImgRef.current = null; redraw(); return; }
    const img = new Image();
    img.onload = () => { bgImgRef.current = img; redraw(); };
    img.src = bgImageUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgImageUrl]);

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    drawPreview(canvasRef.current, w, h, bgColor, bgImgRef.current, beadColor);
  }, [w, h, bgColor, beadColor]);

  /* Перерисовываем при любом изменении параметров */
  useEffect(() => { redraw(); }, [redraw]);

  /* После монтирования canvas-элемента (wOk && hOk стали true) — сразу рисуем */
  useLayoutEffect(() => {
    if (wOk && hOk) redraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wOk, hOk]);

  /* ── Handlers ── */

  const pushRecent = (color: string) => {
    setRecentColors((prev) => {
      const n2   = norm(color);
      const next = [n2, ...prev.filter((c) => norm(c) !== n2)].slice(0, 10);
      saveRecentColors(next);
      return next;
    });
  };

  const selectBgColor = (color: string) => { setBgColor(color); pushRecent(color); };
  const selectBeadColor = (color: string) => { setBeadColor(color); pushRecent(color); };

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
    const W = Number(width);
    const H = Number(height);
    // Считаем ячейки как в CanvasGrid: rowCount = H*2+1, строки чередуют W и W+1 бусин
    let cellCount = 0;
    for (let row = 0; row < H * 2 + 1; row++) {
      cellCount += row % 2 === 0 ? W : W + 1;
    }
    const cells = beadColor ? Array(cellCount).fill(beadColor) : undefined;
    onCreate({
      name: name.trim(),
      width: W,
      height: H,
      cells,
      backgroundColor: bgColor,
      backgroundImageUrl: bgImageUrl ?? undefined,
    });
  };

  /* ── Color picker block ── */
  const renderColorPicker = (
    currentColor: string,
    onSelect: (c: string) => void,
    fallback = "#f4f5f7",
  ) => (
    <div style={colorPanelStyle}>
      <div style={colorCurrentRowStyle}>
        <div style={colorCurrentInfoStyle}>
          <div style={{
            ...colorPreviewStyle,
            background: currentColor || fallback,
            border: (!currentColor || currentColor === "#ffffff")
              ? "1.5px solid rgba(0,0,0,0.10)"
              : "1.5px solid rgba(255,255,255,0.18)",
          }} />
          <div style={colorHexStyle}>
            {currentColor ? currentColor.toUpperCase() : "По умолчанию"}
          </div>
        </div>
        <label style={colorCustomBtnStyle}>
          Свой
          <input
            type="color"
            value={currentColor || fallback}
            onChange={(e) => onSelect(e.target.value)}
            style={hiddenInputStyle}
          />
        </label>
      </div>
      <div style={colorGridStyle}>
        {recentColors.map((color) => {
          const n2    = norm(color);
          const active = norm(currentColor) === n2;
          const light  = n2 === "#ffffff" || n2 === "#f2f2f7" || n2 === "#ffcc00";
          return (
            <button key={n2} type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onSelect(n2)}
              style={{
                ...colorDotBtnStyle, background: n2,
                border: active ? "2.5px solid #d9825f"
                  : light ? "1px solid rgba(0,0,0,0.16)"
                  : "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
              }}
            />
          );
        })}
      </div>
    </div>
  );

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

        {/* Preview */}
        <div style={previewWrapStyle}>
          {wOk && hOk
            ? <canvas ref={canvasRef} style={previewCanvasStyle} />
            : <div style={previewEmptyStyle}>
                <span style={previewEmptyTextStyle}>Введите размер сетки</span>
              </div>
          }
        </div>

        {/* Имя */}
        <div style={cardStyle}>
          <div style={cardRowStyle}>
            <span style={rowLabelStyle}>Имя</span>
          </div>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); widthRef.current?.focus(); } }}
            placeholder="Название проекта"
            enterKeyHint="next"
            autoComplete="off"
            style={{
              ...inputStyle,
              border: name && !name.trim() ? `1px solid ${ds.color.danger}` : `1px solid ${ds.color.border}`,
            }}
          />
        </div>

        {/* Размер */}
        <div style={cardStyle}>
          <div style={cardRowStyle}>
            <span style={rowLabelStyle}>Размер</span>
            <span style={rowHintStyle}>от 1 до 100</span>
          </div>
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
                inputMode="numeric" enterKeyHint="next" pattern="[0-9]*" placeholder="20"
                style={{
                  ...inputStyle, textAlign: "center",
                  border: !width || wOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>
            <div style={sizeSepStyle}>×</div>
            <div style={sizeFieldStyle}>
              <div style={sizeLabelStyle}>Высота</div>
              <input
                ref={heightRef}
                value={height}
                onChange={(e) => setHeight(sanitize(e.target.value))}
                onBlur={() => setHeight((v) => clamp(v))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.blur(); } }}
                inputMode="numeric" enterKeyHint="done" pattern="[0-9]*" placeholder="20"
                style={{
                  ...inputStyle, textAlign: "center",
                  border: !height || hOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Цвет бусин */}
        {canBeads ? (
          <div style={cardStyle}>
            <div style={cardRowStyle}>
              <span style={rowLabelStyle}>Цвет бусин</span>
              <div style={{ display: "flex", gap: 8 }}>
                {beadColor && (
                  <button type="button" style={chipBtnStyle}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setBeadColor("")}
                  >Сброс</button>
                )}
                <button type="button"
                  style={{ ...chipBtnStyle, ...(beadColorOpen ? chipBtnActiveStyle : null) }}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => { setBeadColorOpen((v) => !v); setColorOpen(false); }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                    background: beadColor || "#f4f5f7",
                    border: !beadColor || beadColor === "#ffffff" ? "1.5px solid rgba(0,0,0,0.12)" : "1.5px solid rgba(255,255,255,0.2)",
                  }} />
                  Цвет
                </button>
              </div>
            </div>
            {beadColorOpen && renderColorPicker(beadColor, selectBeadColor)}
          </div>
        ) : (
          <button type="button" style={lockedRowStyle} onClick={() => onOpenPaywall?.("Цвет бусин при создании")}>
            <span style={lockIconStyle}>🔒</span>
            <span style={lockedTextStyle}>Цвет бусин — план <strong>Про</strong></span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: ds.color.primary }}>Открыть →</span>
          </button>
        )}

        {/* Фон */}
        {canBg ? (
          <div style={cardStyle}>
            <div style={cardRowStyle}>
              <span style={rowLabelStyle}>Фон</span>
              <div style={{ display: "flex", gap: 8 }}>
                {bgImageUrl && (
                  <button type="button" style={chipBtnStyle}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setBgImageUrl(null)}
                  >Сброс</button>
                )}
                <label style={chipBtnStyle}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
                      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Фото
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/*"
                    onChange={handleBgImageChange} style={hiddenInputStyle} />
                </label>
                <button type="button"
                  style={{ ...chipBtnStyle, ...(colorOpen ? chipBtnActiveStyle : null) }}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => { setColorOpen((v) => !v); setBeadColorOpen(false); }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                    background: bgColor,
                    border: bgColor === "#ffffff" || bgColor === "#f2f2f7"
                      ? "1.5px solid rgba(0,0,0,0.12)" : "1.5px solid rgba(255,255,255,0.2)",
                  }} />
                  Цвет
                </button>
              </div>
            </div>
            {colorOpen && renderColorPicker(bgColor, selectBgColor, "#ffffff")}
          </div>
        ) : (
          <button type="button" style={lockedRowStyle} onClick={() => onOpenPaywall?.("Фон сетки при создании")}>
            <span style={lockIconStyle}>🔒</span>
            <span style={lockedTextStyle}>Фон сетки — план <strong>Про</strong></span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: ds.color.primary }}>Открыть →</span>
          </button>
        )}

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
  maxWidth: 520,
  marginLeft: "auto",
  marginRight: "auto",
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

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: "18px 18px 0",
  boxSizing: "border-box",
};

/* Preview */
const previewWrapStyle: React.CSSProperties = {
  width: "100%",
  height: "clamp(160px, 30vh, 220px)",
  borderRadius: ds.radius.xxl,
  overflow: "hidden",
  flexShrink: 0,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.04)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewCanvasStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

const previewEmptyStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewEmptyTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: ds.color.textQuaternary,
  fontWeight: 600,
};

/* Card — как секция в ExportScreen */
const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "14px 16px",
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const cardRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const rowHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: ds.color.textTertiary,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "12px 14px",
  borderRadius: ds.radius.xl,
  fontSize: 16,
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
  gap: 6,
};

const sizeLabelStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const sizeSepStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: 22,
  fontWeight: ds.weight.semibold,
  paddingBottom: 10,
  flexShrink: 0,
};

/* Chip buttons */
const chipBtnStyle: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: ds.radius.pill,
  border: `1px solid ${ds.color.border}`,
  background: ds.color.iconButtonBg,
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  position: "relative",
  overflow: "hidden",
  WebkitTapHighlightColor: "transparent",
  flexShrink: 0,
};

const chipBtnActiveStyle: React.CSSProperties = {
  background: ds.color.surfaceElevated,
  border: `1px solid ${ds.color.borderStrong}`,
  color: ds.color.textPrimary,
};

const hiddenInputStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
};

/* Color picker */
const colorPanelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.04)",
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
  width: 38,
  height: 38,
  borderRadius: 14,
  flexShrink: 0,
  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
};

const colorHexStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
};

const colorCustomBtnStyle: React.CSSProperties = {
  position: "relative",
  height: 38,
  minWidth: 68,
  padding: "0 14px",
  borderRadius: 14,
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
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 8,
};

const colorDotBtnStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
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
  height: "max(20px, var(--app-tg-safe-bottom, 0px))",
};

const lockedRowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderRadius: 16,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
  cursor: "pointer",
  textAlign: "left",
  boxSizing: "border-box",
};

const lockIconStyle: React.CSSProperties = {
  fontSize: 16,
  flexShrink: 0,
};

const lockedTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: ds.color.textTertiary,
};
