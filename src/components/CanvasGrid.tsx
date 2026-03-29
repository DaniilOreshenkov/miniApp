import React, { useMemo, useRef, useState } from "react";

type Tool = "select" | "move" | "brush" | "erase" | "palette";

interface Props {
  tool: Tool;
}

type Cell = {
  color: string;
};

const baseColor = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;

const CanvasGrid: React.FC<Props> = ({ tool }) => {
  const width = 5;
  const height = 5;

  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? width - 1 : width;
  };

  const grid = useMemo<Cell[][]>(() => {
    return Array.from({ length: height }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex) }, () => ({
        color: baseColor,
      }))
    );
  }, []);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const startPan = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool !== "move") return;

    const point =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    dragging.current = true;
    lastPoint.current = point;
  };

  const movePan = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging.current || tool !== "move") return;

    const point =
      "touches" in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };

    const dx = point.x - lastPoint.current.x;
    const dy = point.y - lastPoint.current.y;

    setOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    lastPoint.current = point;
  };

  const stopPan = () => {
    dragging.current = false;
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, MAX_ZOOM));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, MIN_ZOOM));
  };

  const fit = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const boardWidth = (width - 1) * xStep + bead;
  const boardHeight = (height - 1) * yStep + bead;

  return (
    <div style={wrapper}>
      {/* controls */}
      <div style={controls}>
        <div style={percentBadge}>{Math.round(scale * 100)}%</div>

        <button type="button" onClick={zoomIn} style={controlButton}>
          +
        </button>

        <button type="button" onClick={zoomOut} style={controlButton}>
          −
        </button>

        <button type="button" onClick={fit} style={controlButton}>
          Fit
        </button>
      </div>

      {/* stage */}
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
        <div style={viewport}>
          <div
            style={{
              width: boardWidth,
              height: boardHeight,
              position: "relative",
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            {grid.map((row, r) => {
              const rowLength = getRowLength(r);
              const rowStartX = rowLength === width ? 0 : xStep / 2;

              return row.map((cell, c) => {
                const left = rowStartX + c * xStep;
                const top = r * yStep;
                const isBase = cell.color === baseColor;

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
                      background: isBase
                        ? "linear-gradient(180deg, #fafafa 0%, #e9eaec 100%)"
                        : cell.color,
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

const wrapper: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

const controls: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "center",
};

const percentBadge: React.CSSProperties = {
  minWidth: 56,
  height: 34,
  padding: "0 10px",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(27,29,34,0.92)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
  backdropFilter: "blur(14px)",
};

const controlButton: React.CSSProperties = {
  width: 44,
  height: 44,
  border: "none",
  borderRadius: 14,
  background: "rgba(27,29,34,0.92)",
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
  backdropFilter: "blur(14px)",
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
  paddingTop: 18,
  paddingRight: 72,
  paddingBottom: 18,
  paddingLeft: 18,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};