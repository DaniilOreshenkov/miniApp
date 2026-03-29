import React, { useMemo, useRef, useState } from "react";

const CanvasGrid: React.FC = () => {
  const crossesX = 5;
  const crossesY = 5;

  const beadSize = 26;
  const horizontalGap = 6;
  const verticalStep = 20;

  const rows = crossesY * 2 + 1;

  const rowLengths = useMemo(
    () =>
      Array.from({ length: rows }, (_, row) =>
        row % 2 === 0 ? crossesX : crossesX + 1
      ),
    [rows, crossesX]
  );

  const totalBeads = rowLengths.reduce((sum, value) => sum + value, 0);

  const [colors] = useState<string[]>(Array(totalBeads).fill("#e5e5e5"));
  const [scale, setScale] = useState(1);
  const [locked, setLocked] = useState(true);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const rowStartIndexes = useMemo(() => {
    const starts: number[] = [];
    let current = 0;

    for (const length of rowLengths) {
      starts.push(current);
      current += length;
    }

    return starts;
  }, [rowLengths]);

  const handlePointerDown = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (!locked) return;

    const point = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    dragging.current = true;
    lastPoint.current = point;
  };

  const handlePointerMove = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (!dragging.current || !locked) return;

    const point = "touches" in e
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

  const stopDragging = () => {
    dragging.current = false;
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 4));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  const fit = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
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

        <button
          type="button"
          onClick={() => setLocked((prev) => !prev)}
          style={controlButton}
          title={locked ? "Перемещение включено" : "Перемещение выключено"}
        >
          {locked ? "🔒" : "🔓"}
        </button>

        <button type="button" onClick={fit} style={controlButton}>
          Fit
        </button>
      </div>

      <div
        style={stage}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={stopDragging}
      >
        <div style={viewport}>
          <div
            style={{
              ...gridLayer,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            {rowLengths.map((length, row) => {
              const startIndex = rowStartIndexes[row];
              const shifted = row % 2 === 0;

              return (
                <div
                  key={row}
                  style={{
                    ...rowStyle,
                    marginLeft: shifted ? beadSize / 2 : 0,
                    marginTop: row === 0 ? 0 : -(beadSize - verticalStep),
                  }}
                >
                  {Array.from({ length }).map((_, col) => {
                    const index = startIndex + col;

                    return (
                      <div
                        key={index}
                        style={{
                          ...beadStyle,
                          width: beadSize,
                          height: beadSize,
                          background: colors[index],
                          marginLeft: col === 0 ? 0 : horizontalGap,
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

const gridLayer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  transformOrigin: "center center",
  willChange: "transform",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const beadStyle: React.CSSProperties = {
  borderRadius: "50%",
  boxShadow:
    "inset 0 0 0 1px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.18)",
  flexShrink: 0,
};