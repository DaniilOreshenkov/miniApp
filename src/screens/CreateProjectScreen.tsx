/**
 * CreateProjectScreen — полноэкранная форма создания нового проекта.
 */

import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { ds } from "../design-system/tokens";
import type { GridSeed } from "../entities/project/types";
import {
  screenRoot, screenTopBar, screenBackBtn, screenTitle, screenScroll,
  screenPreview, screenPreviewCanvas, sectionLabel, sectionCard,
  screenInput, sizeRow, sizeField, sizeSubLabel, sizeSep, sizeHint,
  chipRow, chip, chipActive, chipDot, colorPanel, colorPanelRow,
  colorSwatch, colorHex, colorCustomBtn, colorDotsGrid, colorDot,
  hiddenColorInput, primaryBtn, safeBottom,
} from "./screenStyles";

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

  /* ── Render ── */
  return (
    <div style={screenRoot}>

      {/* Top bar */}
      <div style={screenTopBar}>
        <button type="button" style={screenBackBtn} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={screenTitle}>Новый проект</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Scroll */}
      <div style={screenScroll} className="app-scroll">

        {/* Live превью */}
        <div style={screenPreview}>
          {wOk && hOk
            ? <canvas ref={canvasRef} style={screenPreviewCanvas} />
            : <div style={{ width: "100%", height: "100%" }} />
          }
        </div>

        {/* Имя */}
        <div>
          <div style={sectionLabel}>Имя проекта</div>
          <div style={sectionCard}>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); widthRef.current?.focus(); } }}
              placeholder="Введите имя"
              enterKeyHint="next"
              autoComplete="off"
              style={{
                ...screenInput,
                border: name && !name.trim() ? `1px solid ${ds.color.danger}` : `1px solid ${ds.color.border}`,
              }}
            />
          </div>
        </div>

        {/* Размер */}
        <div>
          <div style={sectionLabel}>Размер сетки</div>
          <div style={sectionCard}>
            <div style={sizeRow}>
              <div style={sizeField}>
                <div style={sizeSubLabel}>Ширина</div>
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
                  style={{ ...screenInput, textAlign: "center",
                    border: !width || wOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}` }}
                />
              </div>
              <div style={sizeSep}>×</div>
              <div style={sizeField}>
                <div style={sizeSubLabel}>Высота</div>
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
                  style={{ ...screenInput, textAlign: "center",
                    border: !height || hOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}` }}
                />
              </div>
            </div>
            <div style={sizeHint}>от 1 до 100</div>
          </div>
        </div>

        {/* Цвет бусин */}
        <div>
          <div style={sectionLabel}>Цвет бусин</div>
          <div style={sectionCard}>
            <div style={chipRow}>
              <button type="button"
                style={{ ...chip, ...(beadColorOpen ? chipActive : null) }}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setBeadColorOpen((v) => !v); setColorOpen(false); }}
              >
                <span style={{ ...chipDot, background: beadColor || "#f4f5f7",
                  border: !beadColor ? "1.5px solid rgba(0,0,0,0.12)" : "1.5px solid rgba(255,255,255,0.2)" }} />
                {beadColor ? beadColor.toUpperCase() : "По умолчанию"}
              </button>
              {beadColor && (
                <button type="button" style={chip}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setBeadColor("")}>
                  Сброс
                </button>
              )}
            </div>
            {beadColorOpen && (
              <div style={colorPanel}>
                <div style={colorPanelRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ ...colorSwatch, background: beadColor || "#f4f5f7",
                      border: !beadColor ? "1.5px solid rgba(0,0,0,0.10)" : "1.5px solid rgba(255,255,255,0.18)" }} />
                    <span style={colorHex}>{beadColor ? beadColor.toUpperCase() : "По умолчанию"}</span>
                  </div>
                  <label style={colorCustomBtn}>Свой
                    <input type="color" value={beadColor || "#f4f5f7"}
                      onChange={(e) => selectBeadColor(e.target.value)} style={hiddenColorInput} />
                  </label>
                </div>
                <div style={colorDotsGrid}>
                  {recentColors.map((c) => {
                    const n2 = norm(c); const isActive = norm(beadColor) === n2;
                    const light = n2 === "#ffffff" || n2 === "#f2f2f7" || n2 === "#ffcc00";
                    return (
                      <button key={n2} type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => selectBeadColor(n2)}
                        style={{ ...colorDot, background: n2,
                          border: isActive ? "2.5px solid #d9825f" : light ? "1.5px solid rgba(0,0,0,0.16)" : "1.5px solid rgba(255,255,255,0.14)" }} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Фон */}
        <div>
          <div style={sectionLabel}>Фон сетки</div>
          <div style={sectionCard}>
            <div style={chipRow}>
              <button type="button"
                style={{ ...chip, ...(colorOpen ? chipActive : null) }}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setColorOpen((v) => !v); setBeadColorOpen(false); }}
              >
                <span style={{ ...chipDot, background: bgColor,
                  border: bgColor === "#ffffff" ? "1.5px solid rgba(0,0,0,0.12)" : "1.5px solid rgba(255,255,255,0.2)" }} />
                {bgColor.toUpperCase()}
              </button>
              <label style={chip}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Фото
                <input type="file" accept="image/*" onChange={handleBgImageChange} style={hiddenColorInput} />
              </label>
              {bgImageUrl && (
                <button type="button" style={chip}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setBgImageUrl(null)}>
                  Убрать фото
                </button>
              )}
            </div>
            {colorOpen && (
              <div style={colorPanel}>
                <div style={colorPanelRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ ...colorSwatch, background: bgColor,
                      border: bgColor === "#ffffff" ? "1.5px solid rgba(0,0,0,0.10)" : "1.5px solid rgba(255,255,255,0.18)" }} />
                    <span style={colorHex}>{bgColor.toUpperCase()}</span>
                  </div>
                  <label style={colorCustomBtn}>Свой
                    <input type="color" value={bgColor}
                      onChange={(e) => selectBgColor(e.target.value)} style={hiddenColorInput} />
                  </label>
                </div>
                <div style={colorDotsGrid}>
                  {recentColors.map((c) => {
                    const n2 = norm(c); const isActive = norm(bgColor) === n2;
                    const light = n2 === "#ffffff" || n2 === "#f2f2f7" || n2 === "#ffcc00";
                    return (
                      <button key={n2} type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => selectBgColor(n2)}
                        style={{ ...colorDot, background: n2,
                          border: isActive ? "2.5px solid #d9825f" : light ? "1.5px solid rgba(0,0,0,0.16)" : "1.5px solid rgba(255,255,255,0.14)" }} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Создать */}
        <button type="button"
          style={{ ...primaryBtn, opacity: isDisabled ? 0.48 : 1, cursor: isDisabled ? "not-allowed" : "pointer" }}
          onClick={handleCreate} disabled={isDisabled}>
          Создать проект
        </button>

        <div style={safeBottom} />
      </div>
    </div>
  );
};

export default CreateProjectScreen;

