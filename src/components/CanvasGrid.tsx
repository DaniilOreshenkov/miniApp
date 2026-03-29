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
    []
  );

  const total = rowLengths.reduce((a, b) => a + b, 0);
  const [colors] = useState<string[]>(Array(total).fill("#e5e5e5"));

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const startDrag = (e: any) => {
    if (tool !== "move") return;

    const p = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    dragging.current = true;
    last.current = p;
  };

  const moveDrag = (e: any) => {
    if (!dragging.current || tool !== "move") return;

    const p = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    const dx = p.x - last.current.x;
    const dy = p.y - last.current.y;

    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    last.current = p;
  };

  const stop = () => (dragging.current = false);

  return (
    <div
      style={wrapper}
      onMouseDown={startDrag}
      onMouseMove={moveDrag}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={startDrag}
      onTouchMove={moveDrag}
      onTouchEnd={stop}
    >
      <div style={viewport}>
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          {rowLengths.map((len, row) => (
            <div key={row} style={{ display: "flex", marginLeft: row % 2 ? beadSize / 2 : 0 }}>
              {Array.from({ length: len }).map((_, i) => (
                <div
                  key={i}
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