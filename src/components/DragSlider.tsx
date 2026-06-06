import React, { useRef, useCallback } from "react";

const DragSlider: React.FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ value, min = 0, max = 100, step = 1, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const computeValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    return Math.round(raw / step) * step;
  }, [min, max, step, value]);

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={trackRef}
      style={{ position: "relative", height: 44, cursor: "pointer", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        isDragging.current = true;
        onChange(computeValue(e.clientX));
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (!isDragging.current) return;
        onChange(computeValue(e.clientX));
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        e.currentTarget.releasePointerCapture(e.pointerId);
        isDragging.current = false;
      }}
      onPointerCancel={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        isDragging.current = false;
      }}
    >
      {/* track */}
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 5, background: "rgba(255,255,255,0.15)", borderRadius: 3, transform: "translateY(-50%)", overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "var(--primary)", borderRadius: 3 }} />
      </div>
      {/* thumb */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: `${percent}%`,
        width: 26, height: 26,
        background: "#ffffff",
        borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }} />
    </div>
  );
};

export default DragSlider;
