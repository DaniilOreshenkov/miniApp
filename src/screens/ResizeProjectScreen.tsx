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
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";

export type ResizeHorizontalAnchor = "left" | "center" | "right";
export type ResizeVerticalAnchor   = "top"  | "center" | "bottom";

interface Props {
  currentWidth:  number;
  currentHeight: number;
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

const drawPreview = (canvas: HTMLCanvasElement, w: number, h: number) => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw  = canvas.offsetWidth;
  const ch  = canvas.offsetHeight;
  if (cw === 0 || ch === 0 || w <= 0 || h <= 0) return;

  canvas.width  = cw * dpr;
  canvas.height = ch * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, cw, ch);

  const BEAD  = 24;
  const GAP   = 6;
  const STR   = 1.12;
  const xStep = (BEAD + GAP) * STR;
  const yStep = Math.sqrt(BEAD * BEAD - (xStep / 2) ** 2);

  const rowCount  = h * 2 + 1;
  const maxRowLen = w + 1;
  const boardW    = (maxRowLen - 1) * xStep + BEAD;
  const boardH    = (rowCount  - 1) * yStep + BEAD;

  const PAD      = 8;
  const MAX_R    = 7;
  const fitScale = Math.min((cw - PAD * 2) / boardW, (ch - PAD * 2) / boardH);
  const scale    = Math.min(fitScale, (MAX_R * 2) / BEAD);
  const r        = (BEAD / 2) * scale;
  const sy       = yStep * scale;
  const ox       = (cw - boardW * scale) / 2;
  const oy       = (ch - boardH * scale) / 2;

  ctx.save();
  ctx.rect(0, 0, cw, ch);
  ctx.clip();

  for (let row = 0; row < rowCount; row++) {
    const rowLen    = row % 2 === 0 ? w : maxRowLen;
    const rowStartX = rowLen === maxRowLen ? 0 : xStep / 2;

    for (let col = 0; col < rowLen; col++) {
      const cx = ox + (rowStartX + col * xStep) * scale + r;
      const cy = oy + row * sy + r;
      if (cx + r < 0 || cx - r > cw || cy + r < 0 || cy - r > ch) continue;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f4f5f7";
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(0,0,0,0.10)";
      ctx.stroke();
    }
  }

  ctx.restore();
};

/* ─── Anchor picker ──────────────────────────────────────────────────────── */

const H_ANCHORS: ResizeHorizontalAnchor[] = ["left", "center", "right"];
const V_ANCHORS: ResizeVerticalAnchor[]   = ["top",  "center", "bottom"];

const H_LABELS: Record<ResizeHorizontalAnchor, string> = { left: "←", center: "·", right: "→" };
const V_LABELS: Record<ResizeVerticalAnchor,   string> = { top: "↑",  center: "·", bottom: "↓" };

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

  const wOk = isValid(width);
  const hOk = isValid(height);
  const w   = wOk ? Number(width)  : 0;
  const h   = hOk ? Number(height) : 0;

  const isDisabled = !wOk || !hOk;

  const redraw = useCallback(() => {
    if (!canvasRef.current || w <= 0 || h <= 0) return;
    drawPreview(canvasRef.current, w, h);
  }, [w, h]);

  useEffect(() => { redraw(); }, [redraw]);
  useLayoutEffect(() => { if (wOk && hOk) redraw(); }, [wOk, hOk]); // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* Размер */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Новый размер</div>
          <div style={sizeRowStyle}>
            <div style={sizeFieldStyle}>
              <div style={sizeLabelStyle}>Ширина</div>
              <input
                ref={widthRef}
                value={width}
                onChange={(e) => setWidth(sanitize(e.target.value))}
                onBlur={() => setWidth((v) => clamp(v, currentWidth))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.focus(); } }}
                inputMode="numeric"
                enterKeyHint="next"
                pattern="[0-9]*"
                placeholder={String(currentWidth)}
                style={{
                  ...inputStyle,
                  textAlign: "center",
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
                onBlur={() => setHeight((v) => clamp(v, currentHeight))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightRef.current?.blur(); } }}
                inputMode="numeric"
                enterKeyHint="done"
                pattern="[0-9]*"
                placeholder={String(currentHeight)}
                style={{
                  ...inputStyle,
                  textAlign: "center",
                  border: !height || hOk ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
                }}
              />
            </div>
          </div>
          <div style={hintStyle}>от {MIN} до {MAX}</div>
        </div>

        {/* Якорь */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Якорь изменения</div>
          <div style={anchorRowStyle}>
            <AnchorPicker
              hAnchor={hAnchor} vAnchor={vAnchor}
              onH={setHAnchor}  onV={setVAnchor}
            />
            <div style={anchorDescStyle}>
              <div style={anchorDescLineStyle}>
                по горизонтали: <strong>{
                  hAnchor === "left" ? "слева" : hAnchor === "right" ? "справа" : "по центру"
                }</strong>
              </div>
              <div style={anchorDescLineStyle}>
                по вертикали: <strong>{
                  vAnchor === "top" ? "сверху" : vAnchor === "bottom" ? "снизу" : "по центру"
                }</strong>
              </div>
            </div>
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

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const sizeRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
};

const sizeFieldStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sizeLabelStyle: React.CSSProperties = {
  fontSize: ds.font.caption,
  fontWeight: ds.weight.medium,
  color: ds.color.textSecondary,
};

const sizeSepStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 22,
  fontWeight: ds.weight.bold,
  color: ds.color.textTertiary,
  paddingBottom: 12,
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

const hintStyle: React.CSSProperties = {
  fontSize: ds.font.caption,
  color: ds.color.textTertiary,
};

const anchorRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 20,
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

const anchorDescStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const anchorDescLineStyle: React.CSSProperties = {
  fontSize: ds.font.bodyMd,
  color: ds.color.textSecondary,
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
