/**
 * PlacementEditor — позиционирование и масштаб импорта на сетке.
 *
 * Управление:
 *   - Тащи превью → меняй позицию
 *   - "−" / "+" → уменьшить / увеличить область импорта
 */

import React, { useCallback, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import type { PlacementOffset } from "../utils/projectPng";

export type PlacementResult = {
  offset: PlacementOffset;
  importWidth: number;
  importHeight: number;
};

interface Props {
  gridWidth: number;
  gridHeight: number;
  importWidth: number;
  importHeight: number;
  previewUrl: string;
  initialOffset?: PlacementOffset;
  onConfirm: (result: PlacementResult) => void;
  onCancel: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Size step when pressing +/−
const SIZE_STEP = 5;
const MIN_IMPORT = 5;

const PlacementEditor: React.FC<Props> = ({
  gridWidth, gridHeight,
  importWidth: initIW,
  importHeight: initIH,
  previewUrl,
  initialOffset,
  onConfirm,
  onCancel,
}) => {
  const [iW, setIW] = useState(initIW);
  const [iH, setIH] = useState(initIH);

  const maxX = (w: number) => Math.max(0, gridWidth  - w);
  const maxY = (h: number) => Math.max(0, gridHeight - h);

  const [offset, setOffset] = useState<PlacementOffset>(() => {
    const mx = maxX(initIW), my = maxY(initIH);
    return initialOffset
      ? { x: clamp(initialOffset.x, 0, mx), y: clamp(initialOffset.y, 0, my) }
      : { x: Math.round(mx / 2), y: Math.round(my / 2) };
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef  = useRef(false);
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const toOffset = useCallback((
    clientX: number, clientY: number,
    startPx: { px: number; py: number },
    startOff: { ox: number; oy: number },
    w: number, h: number,
  ): PlacementOffset => {
    const el = containerRef.current;
    if (!el) return offset;
    const rect = el.getBoundingClientRect();
    const cw = rect.width  / gridWidth;
    const ch = rect.height / gridHeight;
    return {
      x: clamp(startOff.ox + Math.round((clientX - startPx.px) / cw), 0, maxX(w)),
      y: clamp(startOff.oy + Math.round((clientY - startPx.py) / ch), 0, maxY(h)),
    };
  }, [gridWidth, gridHeight, offset, maxX, maxY]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    dragStartRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !dragStartRef.current) return;
    e.preventDefault();
    const s = dragStartRef.current;
    setOffset(toOffset(e.clientX, e.clientY, { px: s.px, py: s.py }, { ox: s.ox, oy: s.oy }, iW, iH));
  }, [toOffset, iW, iH]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !dragStartRef.current) return;
    const s = dragStartRef.current;
    setOffset(toOffset(e.clientX, e.clientY, { px: s.px, py: s.py }, { ox: s.ox, oy: s.oy }, iW, iH));
    draggingRef.current = false;
    dragStartRef.current = null;
  }, [toOffset, iW, iH]);

  const handleShrink = () => {
    const nw = Math.max(MIN_IMPORT, iW - SIZE_STEP);
    const nh = Math.max(MIN_IMPORT, iH - SIZE_STEP);
    setIW(nw); setIH(nh);
    setOffset(o => ({ x: clamp(o.x, 0, maxX(nw)), y: clamp(o.y, 0, maxY(nh)) }));
  };

  const handleGrow = () => {
    const nw = Math.min(gridWidth,  iW + SIZE_STEP);
    const nh = Math.min(gridHeight, iH + SIZE_STEP);
    setIW(nw); setIH(nh);
    setOffset(o => ({ x: clamp(o.x, 0, maxX(nw)), y: clamp(o.y, 0, maxY(nh)) }));
  };

  const left   = `${(offset.x / gridWidth)  * 100}%`;
  const top    = `${(offset.y / gridHeight) * 100}%`;
  const width  = `${(iW / gridWidth)  * 100}%`;
  const height = `${(iH / gridHeight) * 100}%`;

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button type="button" style={cancelBtnStyle} onClick={onCancel}>Отмена</button>
        <div style={titleStyle}>Разместить</div>
        <button
          type="button"
          style={confirmBtnStyle}
          onClick={() => onConfirm({ offset, importWidth: iW, importHeight: iH })}
        >
          Готово
        </button>
      </div>

      {/* Grid area */}
      <div style={gridWrapStyle}>
        <div ref={containerRef} style={gridAreaStyle}>
          <div style={gridDotsStyle(gridWidth, gridHeight)} />

          {/* Draggable import area */}
          <div
            style={{
              position: "absolute",
              left, top, width, height,
              cursor: "grab",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              src={previewUrl}
              alt="Импорт"
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block", pointerEvents: "none" }}
              draggable={false}
            />
            <div style={importBorderStyle} />
          </div>
        </div>

        {/* Info */}
        <div style={infoStyle}>
          {iW}×{iH} · позиция {offset.x},{offset.y}
        </div>
      </div>

      {/* Bottom toolbar: − ✋ + */}
      <div style={toolbarStyle}>
        <button type="button" style={toolBtnStyle} onClick={handleShrink} disabled={iW <= MIN_IMPORT && iH <= MIN_IMPORT}>
          <span style={toolIconStyle}>−</span>
          <span style={toolLabelStyle}>Меньше</span>
        </button>

        <div style={toolBtnStyle}>
          <span style={{ fontSize: 24 }}>✋</span>
          <span style={toolLabelStyle}>Тащи</span>
        </div>

        <button type="button" style={toolBtnStyle} onClick={handleGrow} disabled={iW >= gridWidth && iH >= gridHeight}>
          <span style={toolIconStyle}>+</span>
          <span style={toolLabelStyle}>Больше</span>
        </button>
      </div>

      <div style={{ height: "max(16px, var(--app-tg-safe-bottom, 0px))", flexShrink: 0 }} />
    </div>
  );
};

export default PlacementEditor;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 200,
  background: "#0b0e14",
  display: "flex", flexDirection: "column",
};

const topBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
  padding: "var(--app-safe-top, 0px) 16px 0",
  height: "calc(var(--app-safe-top, 0px) + 56px)",
  background: "rgba(0,0,0,0.5)",
};

const titleStyle: React.CSSProperties = {
  color: "#fff", fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold, textAlign: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: "rgba(255,255,255,0.65)", fontSize: ds.font.bodyMd,
  cursor: "pointer", padding: "8px 0", justifySelf: "start",
};

const confirmBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: ds.color.primary, fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold, cursor: "pointer",
  padding: "8px 0", justifySelf: "end",
};

const gridWrapStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  padding: "16px 24px 8px", gap: 8, minHeight: 0,
};

const gridAreaStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxHeight: "calc(100% - 28px)",
  aspectRatio: "1 / 1",
  background: "rgba(255,255,255,0.05)",
  borderRadius: ds.radius.xl,
  border: `1px solid ${ds.color.border}`,
  overflow: "hidden",
};

const gridDotsStyle = (cols: number, rows: number): React.CSSProperties => ({
  position: "absolute", inset: 0,
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
  backgroundSize: `${100 / Math.min(cols, 40)}% ${100 / Math.min(rows, 40)}%`,
  pointerEvents: "none",
});

const importBorderStyle: React.CSSProperties = {
  position: "absolute", inset: 0,
  border: `2px solid ${ds.color.primary}`,
  borderRadius: 3, boxSizing: "border-box",
  pointerEvents: "none",
  boxShadow: `0 0 0 1px ${ds.color.primary}44`,
};

const infoStyle: React.CSSProperties = {
  fontSize: ds.font.caption, color: ds.color.textTertiary,
  fontWeight: ds.weight.medium, fontVariantNumeric: "tabular-nums",
};

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex", alignItems: "stretch",
  margin: "0 20px 12px",
  borderRadius: ds.radius.xl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.05)",
  overflow: "hidden",
};

const toolBtnStyle: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 4,
  padding: "14px 8px",
  background: "none", border: "none", cursor: "pointer",
};

const toolIconStyle: React.CSSProperties = {
  fontSize: 26, color: "#fff", lineHeight: 1,
};

const toolLabelStyle: React.CSSProperties = {
  fontSize: 11, color: ds.color.textTertiary,
  fontWeight: ds.weight.medium,
};
