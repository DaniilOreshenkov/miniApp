import React, { useMemo, useRef, useState } from "react";

interface Props {}

type Cell = {
  color: string;
};

const baseColor = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const GridScreen: React.FC<Props> = () => {
  const width = 5;
  const height = 5;

  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? width - 1 : width;
  };

  const createGrid = () =>
    Array.from({ length: height }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex) }, () => ({
        color: baseColor,
      }))
    );

  const [grid] = useState<Cell[][]>(createGrid());

  const boardRef = useRef<HTMLDivElement | null>(null);

  // 🔥 ZOOM / PAN
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [locked, setLocked] = useState(true);

  const panRef = useRef({
    isDragging: false,
    x: 0,
    y: 0,
  });

  const startPan = (e: any) => {
    if (!locked) return;

    const point =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    panRef.current = {
      isDragging: true,
      x: point.x,
      y: point.y,
    };
  };

  const movePan = (e: any) => {
    if (!panRef.current.isDragging || !locked) return;

    const point =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    const dx = point.x - panRef.current.x;
    const dy = point.y - panRef.current.y;

    setOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    panRef.current.x = point.x;
    panRef.current.y = point.y;
  };

  const stopPan = () => {
    panRef.current.isDragging = false;
  };

  const boardWidth = (width - 1) * xStep + bead;
  const boardHeight = (height - 1) * yStep + bead;

  return (
    <div style={page}>
      {/* 🔥 КНОПКИ */}
      <div style={controls}>
        <div style={badge}>{Math.round(scale * 100)}%</div>

        <button onClick={() => setScale((s) => Math.min(s + 0.2, 4))} style={btn}>+</button>
        <button onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))} style={btn}>−</button>

        <button onClick={() => setLocked((l) => !l)} style={btn}>
          {locked ? "🔒" : "🔓"}
        </button>

        <button
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
          style={btn}
        >
          Fit
        </button>
      </div>

      {/* 🔥 STAGE */}
      <div
        style={stage}
        onMouseDown={startPan}
        onMouseMove={movePan}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        onTouchStart={startPan}
        onTouchMove={movePan}
        onTouchEnd={stopPan}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          <div
            ref={boardRef}
            style={{
              position: "relative",
              width: boardWidth,
              height: boardHeight,
            }}
          >
            {grid.map((row, r) => {
              const rowLength = getRowLength(r);
              const rowStartX = rowLength === width ? 0 : xStep / 2;

              return row.map((cell, c) => {
                const left = rowStartX + c * xStep;
                const top = r * yStep;

                return (
                  <div
                    key={`${r}-${c}`}
                    style={{
                      position: "absolute",
                      left,
                      top,
                      width: bead,
                      height: bead,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(180deg, #fafafa 0%, #e9eaec 100%)",
                      boxShadow:
                        "inset 0 1px 2px rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.12)",
                    }}
                  />
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

//
// ===== STYLES =====
//

const page: React.CSSProperties = {
  width: "100%",
  height: "100vh",
  background: "#0c0e12",
  position: "relative",
};

const stage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

const controls: React.CSSProperties = {
  position: "absolute",
  top: 20,
  right: 20,
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const btn: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "none",
  background: "rgba(28,30,36,0.9)",
  color: "#fff",
  fontSize: 16,
  cursor: "pointer",
};

const badge: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  background: "rgba(28,30,36,0.9)",
  color: "#fff",
  fontSize: 12,
  textAlign: "center",
};