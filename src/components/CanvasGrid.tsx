import React, { useMemo, useRef, useState } from "react";

type Tool = "select" | "move" | "brush" | "erase" | "palette";

interface Props {
  tool: Tool;
}

const CanvasGrid: React.FC<Props> = ({ tool }) => {
  const crossesX = 5;
  const crossesY = 5;

  const beadSize = 26;
  const gap = 6;

  const rows = crossesY * 2 + 1;

  const rowLengths = useMemo(
    () =>
      Array.from({ length: rows }, (_, row) =>
        row % 2 === 0 ? crossesX : crossesX + 1
      ),
    [rows, crossesX]
  );

  const scale = 1;

  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const startDrag = (e: any) => {
    if (tool !== "move") return;

    const point =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    dragging.current = true;
    last.current = point;
  };

  const moveDrag = (e: any) => {
    if (!dragging.current || tool !== "move") return;

    const point =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    const dx = point.x - last.current.x;
    const dy = point.y - last.current.y;

    setOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    last.current = point;
  };

  const stopDrag = () => {
    dragging.current = false;
  };

  return (
    <div
      style={wrapper}
      onMouseDown={startDrag}
      onMouseMove={moveDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchStart={startDrag}
      onTouchMove={moveDrag}
      onTouchEnd={stopDrag}
    >
      <div style={viewport}>
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          {rowLengths.map((length, row) => (
            <div
              key={row}
              style={{
                display: "flex",
                marginLeft: row % 2 === 1 ? beadSize / 2 : 0,
              }}
            >
              {Array.from({ length }).map((_, col) => (
                <div
                  key={col}
                  style={{
                    width: beadSize,
                    height: beadSize,
                    borderRadius: "50%",
                    background: "#e5e5e5",
                    margin: gap / 2,
                  }}
                />
              ))}
            </div>
          ))}
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
  overflow: "hidden",
};

const viewport: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};