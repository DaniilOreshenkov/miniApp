import React, { useMemo, useRef, useState } from "react";

const CanvasGrid: React.FC = () => {
  const crossesX = 5;
  const crossesY = 5;

  const beadSize = 28;
  const horizontalGap = 6;
  const verticalStep = 22;

  const rows = crossesY * 2 + 1;

  const rowLengths = useMemo(
    () =>
      Array.from({ length: rows }, (_, row) =>
        row % 2 === 0 ? crossesX : crossesX + 1
      ),
    [rows, crossesX]
  );

  const totalBeads = rowLengths.reduce((sum, v) => sum + v, 0);

  // ✅ без setColors (исправляет ошибку)
  const [colors] = useState<string[]>(
    Array(totalBeads).fill("#e5e5e5")
  );

  const [scale, setScale] = useState(1);
  const [locked, setLocked] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // ===== DRAG =====
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!locked) return;
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;

    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;

    setOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    last.current = { x: e.clientX, y: e.clientY };
  };

  const stopDrag = () => {
    dragging.current = false;
  };

  // ===== ZOOM =====
  const zoomIn = () => setScale((s) => Math.min(s + 0.2, 4));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, 0.5));

  const fit = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // ===== INDEXES =====
  const rowStartIndexes = useMemo(() => {
    const arr: number[] = [];
    let cur = 0;
    for (const len of rowLengths) {
      arr.push(cur);
      cur += len;
    }
    return arr;
  }, [rowLengths]);

  return (
    <div style={wrapper}>
      {/* ===== CONTROLS ===== */}
      <div style={controls}>
        <div style={percent}>{Math.round(scale * 100)}%</div>

        <button onClick={zoomIn} style={ctrlBtn}>+</button>
        <button onClick={zoomOut} style={ctrlBtn}>−</button>

        <button onClick={() => setLocked((l) => !l)} style={ctrlBtn}>
          {locked ? "🔒" : "🔓"}
        </button>

        <button onClick={fit} style={ctrlBtn}>Fit</button>
      </div>

      {/* ===== STAGE ===== */}
      <div
        style={stage}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          {rowLengths.map((length, row) => {
            const start = rowStartIndexes[row];
            const shifted = row % 2 === 0;

            return (
              <div
                key={row}
                style={{
                  display: "flex",
                  marginLeft: shifted ? beadSize / 2 : 0,
                  marginTop: row === 0 ? 0 : -(beadSize - verticalStep),
                }}
              >
                {Array.from({ length }).map((_, col) => {
                  const i = start + col;

                  return (
                    <div
                      key={i}
                      style={{
                        width: beadSize,
                        height: beadSize,
                        borderRadius: "50%",
                        background: colors[i],
                        marginLeft: col === 0 ? 0 : horizontalGap,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CanvasGrid;

//
// ===== STYLES =====
//

const wrapper: React.CSSProperties = {
  width: "100%",
  height: "100%",
  position: "relative",
};

const stage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  overflow: "hidden",
  touchAction: "none",
};

const controls: React.CSSProperties = {
  position: "absolute",
  right: 10,
  top: "50%",
  transform: "translateY(-50%)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const ctrlBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

const percent: React.CSSProperties = {
  color: "#fff",
  textAlign: "center",
  marginBottom: 4,
};