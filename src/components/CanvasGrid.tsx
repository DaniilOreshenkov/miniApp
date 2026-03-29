import React, { useMemo, useRef, useState } from "react";

type Tool = "select" | "move" | "brush" | "erase" | "palette";

interface Props {
  tool: Tool;
}

const CanvasGrid: React.FC<Props> = ({ tool }) => {
  const crossesX = 5;
  const crossesY = 5;

  const bead = 24;
  const horizontalSpacing = 6;
  const stretchX = 1.12;

  const xStep = (bead + horizontalSpacing) * stretchX;
  const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 4;

  const rows = crossesY * 2 + 1;

  const rowLengths = useMemo(
    () =>
      Array.from({ length: rows }, (_, row) =>
        row % 2 === 0 ? crossesX : crossesX + 1
      ),
    [rows, crossesX]
  );

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const start = (e: any) => {
    if (tool !== "move") return;

    const p =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    dragging.current = true;
    last.current = p;
  };

  const move = (e: any) => {
    if (!dragging.current || tool !== "move") return;

    const p =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    const dx = p.x - last.current.x;
    const dy = p.y - last.current.y;

    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    last.current = p;
  };

  const stop = () => (dragging.current = false);

  const zoomIn = () => setScale((s) => Math.min(s + 0.2, MAX_ZOOM));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, MIN_ZOOM));

  const fit = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div style={wrapper}>
      {/* CONTROLS */}
      <div style={controls}>
        <div style={percent}>{Math.round(scale * 100)}%</div>

        <button onClick={zoomIn} style={btn}>+</button>
        <button onClick={zoomOut} style={btn}>−</button>
        <button onClick={fit} style={btn}>Fit</button>
      </div>

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
        <div style={viewport}>
          <div
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center",
            }}
          >
            {rowLengths.map((len, row) => (
              <div
                key={row}
                style={{
                  display: "flex",
                  marginLeft: row % 2 ? xStep / 2 : 0,
                  marginTop: row === 0 ? 0 : -yStep / 2,
                }}
              >
                {Array.from({ length: len }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: bead,
                      height: bead,
                      borderRadius: "50%",
                      background: "#e5e5e5",
                      marginLeft: i === 0 ? 0 : horizontalSpacing,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasGrid;

//
// STYLES
//

const wrapper: React.CSSProperties = {
  width: "100%",
  height: "100%",
  position: "relative",
};

const controls: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const percent: React.CSSProperties = {
  background: "#1b1d22",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: 10,
  fontSize: 12,
};

const btn: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "none",
  background: "#1b1d22",
  color: "#fff",
  cursor: "pointer",
};

const stage: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  touchAction: "none",
};

const viewport: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};