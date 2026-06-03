/**
 * CropEditor — полноэкранный редактор обрезки изображения.
 *
 * Показывает изображение с четырьмя угловыми ручками.
 * Пользователь перетаскивает ручки чтобы выбрать нужную область.
 * Результат — CropRect в координатах 0–1 (относительных).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import type { CropRect } from "../utils/projectPng";

interface Props {
  imageUrl: string;
  initialCrop?: CropRect;
  onConfirm: (crop: CropRect) => void;
  onCancel: () => void;
}

const MIN_CROP = 0.05; // minimum 5% of image dimension

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Convert pointer position to 0–1 relative coords inside the image element */
const toRelative = (
  el: HTMLDivElement,
  clientX: number,
  clientY: number,
): { rx: number; ry: number } => {
  const rect = el.getBoundingClientRect();
  return {
    rx: clamp((clientX - rect.left) / rect.width, 0, 1),
    ry: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
};

type Handle = "tl" | "tr" | "bl" | "br" | "move";

const CropEditor: React.FC<Props> = ({ imageUrl, initialCrop, onConfirm, onCancel }) => {
  const [crop, setCrop] = useState<CropRect>(
    initialCrop ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
  );

  const imageRef = useRef<HTMLDivElement | null>(null);
  const activeHandleRef = useRef<Handle | null>(null);
  const startPointerRef = useRef<{ rx: number; ry: number } | null>(null);
  const startCropRef = useRef<CropRect | null>(null);

  const handlePointerDown = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      activeHandleRef.current = handle;
      if (imageRef.current) {
        startPointerRef.current = toRelative(imageRef.current, e.clientX, e.clientY);
      }
      startCropRef.current = { ...crop };
    },
    [crop],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const handle = activeHandleRef.current;
    const startPtr = startPointerRef.current;
    const startCrop = startCropRef.current;
    if (!handle || !startPtr || !startCrop || !imageRef.current) return;

    const { rx, ry } = toRelative(imageRef.current, e.clientX, e.clientY);
    const dx = rx - startPtr.rx;
    const dy = ry - startPtr.ry;

    setCrop(() => {
      let { x, y, w, h } = startCrop;

      if (handle === "move") {
        x = clamp(x + dx, 0, 1 - w);
        y = clamp(y + dy, 0, 1 - h);
      } else if (handle === "tl") {
        const newX = clamp(x + dx, 0, x + w - MIN_CROP);
        const newY = clamp(y + dy, 0, y + h - MIN_CROP);
        w = w + (x - newX);
        h = h + (y - newY);
        x = newX;
        y = newY;
      } else if (handle === "tr") {
        const newW = clamp(w + dx, MIN_CROP, 1 - x);
        const newY = clamp(y + dy, 0, y + h - MIN_CROP);
        h = h + (y - newY);
        y = newY;
        w = newW;
      } else if (handle === "bl") {
        const newX = clamp(x + dx, 0, x + w - MIN_CROP);
        w = w + (x - newX);
        x = newX;
        h = clamp(h + dy, MIN_CROP, 1 - y);
      } else if (handle === "br") {
        w = clamp(w + dx, MIN_CROP, 1 - x);
        h = clamp(h + dy, MIN_CROP, 1 - y);
      }

      return { x, y, w: Math.max(MIN_CROP, w), h: Math.max(MIN_CROP, h) };
    });
  }, []);

  // Fix: prev is not needed in the above, let me clean up
  // Actually setCrop receives functional updater so it's fine

  const handlePointerUp = useCallback(() => {
    activeHandleRef.current = null;
    startPointerRef.current = null;
    startCropRef.current = null;
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(crop);
  }, [crop, onConfirm]);

  const { x, y, w, h } = crop;

  // Overlay rects (dark areas outside crop)
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button type="button" style={cancelBtnStyle} onClick={onCancel}>
          Отмена
        </button>
        <div style={titleStyle}>Обрезка</div>
        <button type="button" style={confirmBtnStyle} onClick={handleConfirm}>
          Готово
        </button>
      </div>

      {/* Image + crop overlay */}
      <div style={imageWrapStyle}>
        <div
          ref={imageRef}
          style={imageContainerStyle}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img src={imageUrl} alt="Crop" style={imageStyle} draggable={false} />

          {/* Dark overlay: 4 rects outside the crop box */}
          {/* Top */}
          <div style={{ ...overlayPartStyle, top: 0, left: 0, right: 0, height: pct(y) }} />
          {/* Bottom */}
          <div style={{ ...overlayPartStyle, bottom: 0, left: 0, right: 0, height: pct(1 - y - h) }} />
          {/* Left */}
          <div style={{ ...overlayPartStyle, top: pct(y), left: 0, width: pct(x), height: pct(h) }} />
          {/* Right */}
          <div style={{ ...overlayPartStyle, top: pct(y), right: 0, width: pct(1 - x - w), height: pct(h) }} />

          {/* Crop border */}
          <div
            style={{
              position: "absolute",
              left: pct(x),
              top: pct(y),
              width: pct(w),
              height: pct(h),
              border: "2px solid rgba(255,255,255,0.9)",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          >
            {/* Rule-of-thirds grid lines */}
            <div style={gridLineHStyle("33.33%")} />
            <div style={gridLineHStyle("66.66%")} />
            <div style={gridLineVStyle("33.33%")} />
            <div style={gridLineVStyle("66.66%")} />
          </div>

          {/* Move handle (drag inside crop box to move) */}
          <div
            style={{
              position: "absolute",
              left: pct(x),
              top: pct(y),
              width: pct(w),
              height: pct(h),
              cursor: "move",
              touchAction: "none",
            }}
            onPointerDown={handlePointerDown("move")}
          />

          {/* Corner handles */}
          {(["tl", "tr", "bl", "br"] as const).map((handle) => {
            const isLeft = handle === "tl" || handle === "bl";
            const isTop = handle === "tl" || handle === "tr";
            return (
              <div
                key={handle}
                style={{
                  position: "absolute",
                  left: isLeft ? `calc(${pct(x)} - 14px)` : `calc(${pct(x + w)} - 14px)`,
                  top: isTop ? `calc(${pct(y)} - 14px)` : `calc(${pct(y + h)} - 14px)`,
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  touchAction: "none",
                  cursor: handle === "tl" || handle === "br" ? "nwse-resize" : "nesw-resize",
                  zIndex: 10,
                }}
                onPointerDown={handlePointerDown(handle)}
              >
                <div style={handleDotStyle} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset button */}
      <button
        type="button"
        style={resetBtnStyle}
        onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}
      >
        Сбросить
      </button>
    </div>
  );
};

export default CropEditor;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "#000",
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
  background: "rgba(0,0,0,0.8)",
};

const titleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.7)",
  fontSize: ds.font.bodyMd,
  cursor: "pointer",
  padding: "8px 0",
  justifySelf: "start",
};

const confirmBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: ds.color.primary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  cursor: "pointer",
  padding: "8px 0",
  justifySelf: "end",
};

const imageWrapStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  padding: 16,
};

const imageContainerStyle: React.CSSProperties = {
  position: "relative",
  maxWidth: "100%",
  maxHeight: "100%",
  lineHeight: 0,
  userSelect: "none",
  WebkitUserSelect: "none",
};

const imageStyle: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "calc(100vh - 160px)",
  objectFit: "contain",
  pointerEvents: "none",
};

const overlayPartStyle: React.CSSProperties = {
  position: "absolute",
  background: "rgba(0,0,0,0.55)",
  pointerEvents: "none",
};

const handleDotStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
  border: "2px solid rgba(0,0,0,0.3)",
};

const gridLineHStyle = (top: string): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  right: 0,
  top,
  height: 1,
  background: "rgba(255,255,255,0.25)",
  pointerEvents: "none",
});

const gridLineVStyle = (left: string): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  bottom: 0,
  left,
  width: 1,
  background: "rgba(255,255,255,0.25)",
  pointerEvents: "none",
});

const resetBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  margin: "12px 24px",
  padding: "14px",
  borderRadius: ds.radius.xl,
  border: `1px solid rgba(255,255,255,0.2)`,
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.7)",
  fontSize: ds.font.bodyMd,
  cursor: "pointer",
};
