/**
 * PlacementEditor — полноэкранный редактор позиционирования импорта на сетке.
 *
 * Показывает:
 *   - Полную сетку (серая область)
 *   - Импорт-превью (перетаскиваемый прямоугольник с превью бусин)
 *   - 9 кнопок-пресетов позиции
 *
 * Возвращает offset в ячейках (x, y).
 */

import React, { useCallback, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import type { PlacementOffset } from "../utils/projectPng";

interface Props {
  /** Размер полной сетки */
  gridWidth: number;
  gridHeight: number;
  /** Размер импорта (может быть меньше сетки) */
  importWidth: number;
  importHeight: number;
  /** URL превью импорта (бусины) */
  previewUrl: string;
  /** Начальный offset */
  initialOffset?: PlacementOffset;
  onConfirm: (offset: PlacementOffset) => void;
  onCancel: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const PRESETS: Array<{ label: string; xFn: (maxX: number) => number; yFn: (maxY: number) => number }> = [
  { label: "↖", xFn: () => 0,          yFn: () => 0 },
  { label: "↑", xFn: (mx) => Math.round(mx / 2), yFn: () => 0 },
  { label: "↗", xFn: (mx) => mx,        yFn: () => 0 },
  { label: "←", xFn: () => 0,          yFn: (my) => Math.round(my / 2) },
  { label: "·", xFn: (mx) => Math.round(mx / 2), yFn: (my) => Math.round(my / 2) },
  { label: "→", xFn: (mx) => mx,        yFn: (my) => Math.round(my / 2) },
  { label: "↙", xFn: () => 0,          yFn: (my) => my },
  { label: "↓", xFn: (mx) => Math.round(mx / 2), yFn: (my) => my },
  { label: "↘", xFn: (mx) => mx,        yFn: (my) => my },
];

const PlacementEditor: React.FC<Props> = ({
  gridWidth, gridHeight, importWidth, importHeight,
  previewUrl, initialOffset, onConfirm, onCancel,
}) => {
  const maxX = Math.max(0, gridWidth  - importWidth);
  const maxY = Math.max(0, gridHeight - importHeight);

  const [offset, setOffset] = useState<PlacementOffset>(
    initialOffset ?? { x: Math.round(maxX / 2), y: Math.round(maxY / 2) },
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef  = useRef(false);
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Convert container pixels → cell offset
  const pxToOffset = useCallback((
    clientX: number, clientY: number,
    startPx: { px: number; py: number },
    startOffset: { ox: number; oy: number },
  ): PlacementOffset => {
    const el = containerRef.current;
    if (!el) return offset;
    const rect = el.getBoundingClientRect();
    const cellW = rect.width  / gridWidth;
    const cellH = rect.height / gridHeight;
    const dx = Math.round((clientX - startPx.px) / cellW);
    const dy = Math.round((clientY - startPx.py) / cellH);
    return {
      x: clamp(startOffset.ox + dx, 0, maxX),
      y: clamp(startOffset.oy + dy, 0, maxY),
    };
  }, [gridWidth, gridHeight, maxX, maxY, offset]);

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
    setOffset(pxToOffset(e.clientX, e.clientY, { px: s.px, py: s.py }, { ox: s.ox, oy: s.oy }));
  }, [pxToOffset]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !dragStartRef.current) return;
    const s = dragStartRef.current;
    setOffset(pxToOffset(e.clientX, e.clientY, { px: s.px, py: s.py }, { ox: s.ox, oy: s.oy }));
    draggingRef.current = false;
    dragStartRef.current = null;
  }, [pxToOffset]);

  // Normalized positions for CSS
  const left   = `${(offset.x / gridWidth)  * 100}%`;
  const top    = `${(offset.y / gridHeight) * 100}%`;
  const width  = `${(importWidth  / gridWidth)  * 100}%`;
  const height = `${(importHeight / gridHeight) * 100}%`;

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button type="button" style={cancelBtnStyle} onClick={onCancel}>Отмена</button>
        <div style={titleStyle}>Разместить</div>
        <button type="button" style={confirmBtnStyle} onClick={() => onConfirm(offset)}>Готово</button>
      </div>

      {/* Grid area */}
      <div style={gridWrapStyle}>
        <div ref={containerRef} style={gridAreaStyle}>
          {/* Grid dots pattern */}
          <div style={gridDotsStyle(gridWidth, gridHeight)} />

          {/* Import preview - draggable */}
          <div
            style={{
              position: "absolute",
              left, top, width, height,
              cursor: draggingRef.current ? "grabbing" : "grab",
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
              style={{
                width: "100%",
                height: "100%",
                objectFit: "fill",
                display: "block",
                borderRadius: 4,
                pointerEvents: "none",
              }}
              draggable={false}
            />
            {/* Border */}
            <div style={{
              position: "absolute", inset: 0,
              border: `2px solid ${ds.color.primary}`,
              borderRadius: 4,
              boxSizing: "border-box",
              pointerEvents: "none",
            }} />
          </div>
        </div>

        {/* Offset info */}
        <div style={offsetInfoStyle}>
          X: {offset.x} · Y: {offset.y}
        </div>
      </div>

      {/* Preset buttons — 3×3 grid */}
      <div style={presetsWrapStyle}>
        <div style={presetsLabelStyle}>Быстрая позиция</div>
        <div style={presetsGridStyle}>
          {PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              style={presetBtnStyle}
              onClick={() => setOffset({ x: p.xFn(maxX), y: p.yFn(maxY) })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        type="button"
        style={resetBtnStyle}
        onClick={() => setOffset({ x: Math.round(maxX / 2), y: Math.round(maxY / 2) })}
      >
        По центру
      </button>
    </div>
  );
};

export default PlacementEditor;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "#0b0e14",
  display: "flex",
  flexDirection: "column",
};

const topBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  padding: "var(--app-safe-top, 0px) 16px 0",
  height: "calc(var(--app-safe-top, 0px) + 56px)",
  background: "rgba(0,0,0,0.6)",
};

const titleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: "rgba(255,255,255,0.65)",
  fontSize: ds.font.bodyMd,
  cursor: "pointer", padding: "8px 0",
  justifySelf: "start",
};

const confirmBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: ds.color.primary,
  fontSize: ds.font.bodyMd, fontWeight: ds.weight.semibold,
  cursor: "pointer", padding: "8px 0",
  justifySelf: "end",
};

const gridWrapStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px 20px 8px",
  gap: 8,
  minHeight: 0,
};

const gridAreaStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxHeight: "calc(100% - 32px)",
  aspectRatio: "1 / 1",
  background: "rgba(255,255,255,0.06)",
  borderRadius: ds.radius.xl,
  border: `1px solid ${ds.color.border}`,
  overflow: "hidden",
};

const gridDotsStyle = (cols: number, rows: number): React.CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)`,
  backgroundSize: `${100 / Math.min(cols, 40)}% ${100 / Math.min(rows, 40)}%`,
  pointerEvents: "none",
});

const offsetInfoStyle: React.CSSProperties = {
  fontSize: ds.font.caption,
  color: ds.color.textTertiary,
  fontWeight: ds.weight.medium,
  fontVariantNumeric: "tabular-nums",
};

const presetsWrapStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: "0 20px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const presetsLabelStyle: React.CSSProperties = {
  fontSize: ds.font.caption,
  color: ds.color.textTertiary,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
  letterSpacing: 0.3,
};

const presetsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 6,
};

const presetBtnStyle: React.CSSProperties = {
  height: 44,
  borderRadius: ds.radius.lg,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.8)",
  fontSize: 18,
  cursor: "pointer",
};

const resetBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  margin: "8px 20px 20px",
  padding: "13px",
  borderRadius: ds.radius.xl,
  border: `1px solid rgba(255,255,255,0.15)`,
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.65)",
  fontSize: ds.font.bodyMd,
  cursor: "pointer",
};
