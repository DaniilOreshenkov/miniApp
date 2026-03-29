import React, { useEffect, useMemo, useRef, useState } from "react";

type Tool = "select" | "move" | "brush" | "erase" | "palette";

interface Props {
  tool: Tool;
  width: number;
  height: number;
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

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 4;
const FIT_PADDING = 12;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const CanvasGrid: React.FC<Props> = ({ tool, width, height }) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const rowCount = safeHeight * 2 + 1;
  const maxRowLength = safeWidth + 1;

  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  };

  const grid = useMemo<Cell[][]>(() => {
    return Array.from({ length: rowCount }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex) }, () => ({
        color: baseColor,
      }))
    );
  }, [rowCount, safeWidth]);

  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();

      setViewportSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const getFitScale = () => {
    if (
      viewportSize.width <= 0 ||
      viewportSize.height <= 0 ||
      boardWidth <= 0 ||
      boardHeight <= 0
    ) {
      return 1;
    }

    const availableWidth = Math.max(1, viewportSize.width - FIT_PADDING * 2);
    const availableHeight = Math.max(1, viewportSize.height - FIT_PADDING * 2);

    const fitByWidth = availableWidth / boardWidth;
    const fitByHeight = availableHeight / boardHeight;

    return clamp(Math.min(fitByWidth, fitByHeight), MIN_ZOOM, MAX_ZOOM);
  };

  const fit = () => {
    setScale(getFitScale());
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, viewportSize.width, viewportSize.height]);

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
    setScale((prev) => clamp(prev + 0.2, MIN_ZOOM, MAX_ZOOM));
  };

  const zoomOut = () => {
    setScale((prev) => clamp(prev - 0.2, MIN_ZOOM, MAX_ZOOM));
  };

  return (
    <div style={wrapper}>
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
        <div ref={viewportRef} style={viewport}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: boardWidth,
              height: boardHeight,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            {grid.map((row, r) => {
              const rowLength = getRowLength(r);
              const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

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
  position: "relative",
  width: "100%",
  height: "100%",
  paddingTop: 18,
  paddingRight: 72,
  paddingBottom: 18,
  paddingLeft: 18,
  boxSizing: "border-box",
  overflow: "hidden",
};