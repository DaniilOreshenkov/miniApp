/**
 * ResizeProjectScreen — полноэкранный редактор размера сетки с live-превью.
 *
 * Открывается вместо CreateProjectSheet когда пользователь нажимает «10×10»
 * в редакторе. Показывает превью сетки с новыми размерами и даёт выбрать
 * якорь (откуда расширять/обрезать).
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { resizeGridCells, getRowCount, getRowLength, BASE_GRID_CELL_COLOR } from "../entities/project/grid";
import {
  screenRoot, screenTopBar, screenBackBtn, screenTitle, screenScroll,
  screenPreview, screenPreviewCanvas, sectionLabel, sectionCard,
  screenInput, sizeRow, sizeField, sizeSubLabel, sizeSep, sizeHint,
  primaryBtn, safeBottom,
} from "./screenStyles";

export type ResizeHorizontalAnchor = "left" | "center" | "right";
export type ResizeVerticalAnchor   = "top"  | "center" | "bottom";

interface Props {
  currentWidth:   number;
  currentHeight:  number;
  currentCells:   string[];
  backgroundColor:    string;
  backgroundImageUrl: string | null;
  onClose:  () => void;
  onApply:  (
    width: number,
    height: number,
    hAnchor: ResizeHorizontalAnchor,
    vAnchor: ResizeVerticalAnchor,
  ) => void;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MIN = 1;
const MAX = 100;

const sanitize = (v: string) => v.replace(/\D/g, "");
const isValid  = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isInteger(n) && n >= MIN && n <= MAX;
};
const clamp = (v: string, fallback: number) => {
  if (!v.trim()) return String(fallback);
  const n = Number(v);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(MAX, Math.max(MIN, Math.round(n))));
};

/* ─── Canvas preview (same algorithm as CreateProjectScreen) ─────────────── */

const BEAD  = 24;
const GAP   = 6;
const STR   = 1.12;
const XSTEP = (BEAD + GAP) * STR;
const YSTEP = Math.sqrt(BEAD * BEAD - (XSTEP / 2) ** 2);

const drawPreview = (
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  cells: string[],
  bgColor: string,
  bgImg: HTMLImageElement | null,
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

  // Background
  ctx.fillStyle = bgColor || "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  if (bgImg) {
    const sc = Math.max(cw / bgImg.naturalWidth, ch / bgImg.naturalHeight);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(bgImg,
      (cw - bgImg.naturalWidth * sc) / 2, (ch - bgImg.naturalHeight * sc) / 2,
      bgImg.naturalWidth * sc, bgImg.naturalHeight * sc,
    );
    ctx.globalAlpha = 1;
  }

  const rowCount  = getRowCount(h);
  const maxRowLen = w + 1;
  const boardW    = (maxRowLen - 1) * XSTEP + BEAD;
  const boardH    = (rowCount  - 1) * YSTEP + BEAD;

  const PAD      = 8;
  const MAX_R    = 7;
  const fitScale = Math.min((cw - PAD * 2) / boardW, (ch - PAD * 2) / boardH);
  const scale    = Math.min(fitScale, (MAX_R * 2) / BEAD);
  const r        = (BEAD / 2) * scale;
  const sy       = YSTEP * scale;
  const ox       = (cw - boardW * scale) / 2;
  const oy       = (ch - boardH * scale) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip();

  let cellIdx = 0;
  for (let row = 0; row < rowCount; row++) {
    const rowLen    = getRowLength(w, row);
    const rowStartX = rowLen === maxRowLen ? 0 : XSTEP / 2;

    for (let col = 0; col < rowLen; col++) {
      const cx = ox + (rowStartX + col * XSTEP) * scale + r;
      const cy = oy + row * sy + r;
      const cellColor = cells[cellIdx] || "#f4f5f7";
      cellIdx++;

      if (cx + r < 0 || cx - r > cw || cy + r < 0 || cy - r > ch) continue;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = cellColor === "#ffffff" || cellColor === BASE_GRID_CELL_COLOR
        ? "#f4f5f7"
        : cellColor;
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = cellColor === "#f4f5f7" || cellColor === "#ffffff"
        ? "rgba(0,0,0,0.10)"
        : "rgba(0,0,0,0.18)";
      ctx.stroke();
    }
  }

  ctx.restore();
};

/* ─── Anchor picker ──────────────────────────────────────────────────────── */

const H_ANCHORS: ResizeHorizontalAnchor[] = ["left", "center", "right"];
const V_ANCHORS: ResizeVerticalAnchor[]   = ["top",  "center", "bottom"];


interface AnchorPickerProps {
  hAnchor: ResizeHorizontalAnchor;
  vAnchor: ResizeVerticalAnchor;
  onH: (a: ResizeHorizontalAnchor) => void;
  onV: (a: ResizeVerticalAnchor)   => void;
}

const AnchorPicker: React.FC<AnchorPickerProps> = ({ hAnchor, vAnchor, onH, onV }) => (
  <div style={anchorGridStyle}>
    {V_ANCHORS.map((v) =>
      H_ANCHORS.map((h) => {
        const active = h === hAnchor && v === vAnchor;
        return (
          <button
            key={`${v}-${h}`}
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => { onH(h); onV(v); }}
            style={{
              ...anchorCellStyle,
              background: active ? ds.color.primary : "rgba(255,255,255,0.07)",
              border: active
                ? `1.5px solid ${ds.color.primary}`
                : `1.5px solid ${ds.color.border}`,
              boxShadow: active ? `0 0 0 3px ${ds.color.primary}33` : "none",
            }}
          />
        );
      })
    )}
  </div>
);

/* ─── Component ─────────────────────────────────────────────────────────── */

const ResizeProjectScreen: React.FC<Props> = ({
  currentWidth,
  currentHeight,
  currentCells,
  backgroundColor,
  backgroundImageUrl,
  onClose,
  onApply,
}) => {
  const [width,   setWidth]   = useState(String(currentWidth));
  const [height,  setHeight]  = useState(String(currentHeight));
  const [hAnchor, setHAnchor] = useState<ResizeHorizontalAnchor>("center");
  const [vAnchor, setVAnchor] = useState<ResizeVerticalAnchor>("center");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const widthRef  = useRef<HTMLInputElement | null>(null);
  const heightRef = useRef<HTMLInputElement | null>(null);
  const bgImgRef  = useRef<HTMLImageElement | null>(null);

  const wOk = isValid(width);
  const hOk = isValid(height);
  const w   = wOk ? Number(width)  : 0;
  const h   = hOk ? Number(height) : 0;

  const isDisabled = !wOk || !hOk;

  // Load background image
  useEffect(() => {
    if (!backgroundImageUrl) { bgImgRef.current = null; return; }
    const img = new Image();
    img.onload = () => { bgImgRef.current = img; };
    img.src = backgroundImageUrl;
  }, [backgroundImageUrl]);

  // Compute preview cells by applying resizeGridCells with current anchors
  const previewCells = wOk && hOk
    ? resizeGridCells(currentCells, currentWidth, currentHeight, w, h, hAnchor, vAnchor)
    : [];

  const redraw = useCallback(() => {
    if (!canvasRef.current || w <= 0 || h <= 0) return;
    drawPreview(canvasRef.current, w, h, previewCells, backgroundColor, bgImgRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, previewCells, backgroundColor]);

  useEffect(() => { redraw(); }, [redraw]);
  useLayoutEffect(() => { if (wOk && hOk) redraw(); }, [wOk, hOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    if (isDisabled) return;
    onApply(w, h, hAnchor, vAnchor);
  };

  return (
    <div style={{ ...screenRoot, zIndex: 200 }}>
      <div style={screenTopBar}>
        <button type="button" style={screenBackBtn} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={screenTitle}>Размер сетки</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={screenScroll} className="app-scroll">
        <div style={screenPreview}>
          {wOk && hOk
            ? <canvas ref={canvasRef} style={screenPreviewCanvas} />
            : <div style={{ width: "100%", height: "100%" }} />
          }
        </div>

        <div>
          <div style={sectionLabel}>Новый размер</div>
          <div style={sectionCard}>
            <div style={sizeRow}>
              <div style={sizeField}>
                <div style={sizeSubLabel}>Ширина</div>
                <input ref={widthRef} value={width}
                  onChange={(e) => setWidth(sanitize(e.target.value))}
                  onBlur={() => setWidth((v) => clamp(v, currentWidth))}
                  onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.focus(); } }}
                  inputMode="numeric" enterKeyHint="next" pattern="[0-9]*"
                  placeholder={String(currentWidth)}
                  style={{ ...screenInput, textAlign: "center",
                    border: !width || wOk ? "1px solid var(--border)" : "1px solid var(--danger)" }} />
              </div>
              <div style={sizeSep}>×</div>
              <div style={sizeField}>
                <div style={sizeSubLabel}>Высота</div>
                <input ref={heightRef} value={height}
                  onChange={(e) => setHeight(sanitize(e.target.value))}
                  onBlur={() => setHeight((v) => clamp(v, currentHeight))}
                  onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.blur(); } }}
                  inputMode="numeric" enterKeyHint="done" pattern="[0-9]*"
                  placeholder={String(currentHeight)}
                  style={{ ...screenInput, textAlign: "center",
                    border: !height || hOk ? "1px solid var(--border)" : "1px solid var(--danger)" }} />
              </div>
            </div>
            <div style={sizeHint}>от {MIN} до {MAX}</div>
          </div>
        </div>

        <div>
          <div style={sectionLabel}>Якорь изменения</div>
          <div style={sectionCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <AnchorPicker hAnchor={hAnchor} vAnchor={vAnchor} onH={setHAnchor} onV={setVAnchor} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Горизонталь: <strong>{hAnchor === "left" ? "слева" : hAnchor === "right" ? "справа" : "центр"}</strong>
                </div>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Вертикаль: <strong>{vAnchor === "top" ? "сверху" : vAnchor === "bottom" ? "снизу" : "центр"}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button type="button"
          style={{ ...primaryBtn, opacity: isDisabled ? 0.48 : 1, cursor: isDisabled ? "not-allowed" : "pointer" }}
          onClick={handleApply} disabled={isDisabled}>
          Применить
        </button>

        <div style={safeBottom} />
      </div>
    </div>
  );
};

export default ResizeProjectScreen;

/* ─── Local anchor styles ─────────────────────────────────────────────────── */

const anchorGridStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "repeat(3, 38px)",
  gridTemplateRows: "repeat(3, 38px)",
  gap: 6,
};

const anchorCellStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  cursor: "pointer",
  transition: "background 0.15s, box-shadow 0.15s",
  padding: 0,
};

