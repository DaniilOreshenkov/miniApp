import React, { useMemo, useRef, useState } from "react";

const CanvasGrid: React.FC = () => {
  const width = 5;
  const height = 5;

  const baseColor = "#ffffff";

  const bead = 26;
  const horizontalSpacing = 6;
  const stretchX = 1.12;

  const xStep = (bead + horizontalSpacing) * stretchX;
  const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? width - 1 : width;
  };

  const grid = useMemo(
    () =>
      Array.from({ length: height }, (_, rowIndex) =>
        Array.from({ length: getRowLength(rowIndex) }, () => ({
          color: baseColor,
        }))
      ),
    []
  );

  // 🔥 ZOOM / PAN
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [locked, setLocked] = useState(true);

  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const start = (e: any) => {
    if (!locked) return;

    const p =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    dragging.current = true;
    last.current = p;
  };

  const move = (e: any) => {
    if (!dragging.current || !locked) return;

    const p =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    const dx = p.x - last.current.x;
    const dy = p.y - last.current.y;

    setOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    last.current = p;
  };

  const stop = () => {
    dragging.current = false;
  };

  const boardWidth = (width - 1) * xStep + bead;
  const boardHeight = (height - 1) * yStep + bead;

  return (
    <div style={wrapper}>
      {/* 🔥 КНОПКИ */}
      <div style={controls}>
        <div style={badge}>{Math.round(scale * 100)}%</div>

        <button style={btn} onClick={() => setScale((s) => Math.min(s + 0.2, 4))}>
          +
        </button>

        <button style={btn} onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))}>
          −
        </button>

        <button style={btn} onClick={() => setLocked((l) => !l)}>
          {locked ? "🔒" : "🔓"}
        </button>

        <button
          style={btn}
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          Fit
        </button>
      </div>

      {/* 🔥 STAGE */}
      <div
        style={stage}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              width: boardWidth,
              height: boardHeight,
            }}
          >
            {grid.map((row, r) => {
              const rowLength = getRowLength(r);
              const rowStartX = rowLength === width ? 0 : xStep / 2;

              return row.map((_, c) => {
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

export default CanvasGrid;

//
// ===== STYLES =====
//

const wrapper: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const stage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  touchAction: "none",
};

const controls: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
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
  background: "rgba(27,29,34,0.92)",
  color: "#fff",
  fontSize: 16,
  cursor: "pointer",
};

const badge: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  background: "rgba(27,29,34,0.92)",
  color: "#fff",
  fontSize: 12,
  textAlign: "center",
};