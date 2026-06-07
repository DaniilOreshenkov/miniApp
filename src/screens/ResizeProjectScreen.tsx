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
  useMemo,
  useRef,
  useState,
} from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import { resizeGridCells, getRowCount, getRowLength, BASE_GRID_CELL_COLOR } from "../entities/project/grid";

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
  const previewCells = useMemo(
    () => wOk && hOk
      ? resizeGridCells(currentCells, currentWidth, currentHeight, w, h, hAnchor, vAnchor)
      : [],
    [wOk, hOk, currentCells, currentWidth, currentHeight, w, h, hAnchor, vAnchor],
  );

  const redraw = useCallback(() => {
    if (!canvasRef.current || w <= 0 || h <= 0) return;
    drawPreview(canvasRef.current, w, h, previewCells, backgroundColor, bgImgRef.current);
  }, [w, h, previewCells, backgroundColor]);

  useEffect(() => { redraw(); }, [redraw]);
  useLayoutEffect(() => { if (wOk && hOk) redraw(); }, [wOk, hOk, redraw]);

  const handleApply = () => {
    if (isDisabled) return;
    onApply(w, h, hAnchor, vAnchor);
  };

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button type="button" style={backBtnStyle} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={topTitleStyle}>Размер сетки</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Scroll */}
      <div style={scrollStyle} className="app-scroll">

        {/* Live-превью */}
        <div style={previewWrapStyle}>
          {wOk && hOk ? (
            <canvas ref={canvasRef} style={previewCanvasStyle} />
          ) : (
            <div style={previewEmptyStyle} />
          )}
        </div>

        {/* Settings card */}
        <div style={cardStyle}>

          {/* Размер */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                  <line x1="2" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="2" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="7" y1="2" x2="7" y2="16" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="11" y1="2" x2="11" y2="16" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                </svg>
              </span>
              <div>
                <span style={labelStyle}>Размер</span>
                {wOk && hOk && (
                  <div style={sublabelStyle}>{width}×{height} бусин</div>
                )}
              </div>
            </div>
            <div style={sizeInputsRowStyle}>
              <input
                ref={widthRef}
                value={width}
                onChange={(e) => setWidth(sanitize(e.target.value))}
                onBlur={() => setWidth((v) => clamp(v, currentWidth))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.focus(); } }}
                inputMode="numeric" enterKeyHint="next" pattern="[0-9]*"
                placeholder={String(currentWidth)}
                style={{
                  ...sizeInputStyle,
                  border: !width || wOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
              <span style={sizeSepStyle}>×</span>
              <input
                ref={heightRef}
                value={height}
                onChange={(e) => setHeight(sanitize(e.target.value))}
                onBlur={() => setHeight((v) => clamp(v, currentHeight))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.blur(); } }}
                inputMode="numeric" enterKeyHint="done" pattern="[0-9]*"
                placeholder={String(currentHeight)}
                style={{
                  ...sizeInputStyle,
                  border: !height || hOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Якорь */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="2.5" fill="currentColor"/>
                  <path d="M9 2V5M9 13V16M2 9H5M13 9H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" opacity="0.4"/>
                </svg>
              </span>
              <div>
                <span style={labelStyle}>Якорь</span>
                <div style={sublabelStyle}>
                  {hAnchor === "left" ? "лево" : hAnchor === "right" ? "право" : "центр"} · {vAnchor === "top" ? "верх" : vAnchor === "bottom" ? "низ" : "центр"}
                </div>
              </div>
            </div>
            <AnchorPicker
              hAnchor={hAnchor} vAnchor={vAnchor}
              onH={setHAnchor}  onV={setVAnchor}
            />
          </div>

        </div>

        {/* Кнопка */}
        <button
          type="button"
          style={{
            ...applyBtnStyle,
            opacity: isDisabled ? 0.48 : 1,
            cursor:  isDisabled ? "not-allowed" : "pointer",
          }}
          onClick={handleApply}
          disabled={isDisabled}
        >
          Применить
        </button>

        <div style={safeBottomStyle} />
      </div>
    </div>
  );
};

export default ResizeProjectScreen;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  animation: "ui-sheet-in 360ms cubic-bezier(0.32, 0.72, 0, 1) both",
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
};

const topTitleStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
  letterSpacing: -0.2,
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

const previewWrapStyle: React.CSSProperties = {
  width: "100%",
  height: "clamp(160px, 28vh, 200px)",
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

/* Section card — как в ExportScreen */
const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  padding: "4px 16px",
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 0",
};

const rowLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const rowIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: ds.color.textSecondary,
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const sublabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: ds.color.textTertiary,
  marginTop: 1,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: ds.color.border,
};

const sizeInputsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const sizeInputStyle: React.CSSProperties = {
  ...ui.input,
  width: 58,
  padding: "8px 0",
  borderRadius: ds.radius.lg,
  fontSize: 15,
  fontWeight: 700,
  textAlign: "center",
};

const sizeSepStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: 18,
  fontWeight: ds.weight.semibold,
  flexShrink: 0,
};

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


const applyBtnStyle: React.CSSProperties = {
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
