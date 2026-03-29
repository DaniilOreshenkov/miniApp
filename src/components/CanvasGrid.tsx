import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Tool = "select" | "move" | "brush" | "erase" | "palette";

interface Props {
  tool: Tool;
  width: number;
  height: number;
}

type BeadPoint = {
  x: number;
  y: number;
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

  const getRowLength = useCallback(
    (rowIndex: number) => {
      return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
    },
    [safeWidth],
  );

  const beadPoints = useMemo<BeadPoint[]>(() => {
    const points: BeadPoint[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowLength = getRowLength(rowIndex);
      const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

      for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
        points.push({
          x: rowStartX + columnIndex * xStep,
          y: rowIndex * yStep,
          color: baseColor,
        });
      }
    }

    return points;
  }, [getRowLength, maxRowLength, rowCount]);

  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });

  const [frameSize, setFrameSize] = useState({
    width: 0,
    height: 0,
  });
  const [scale, setScale] = useState(1);

  const requestDraw = useCallback((drawFn: () => void) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawFn();
    });
  }, []);

  const getFitScale = useCallback(() => {
    if (
      frameSize.width <= 0 ||
      frameSize.height <= 0 ||
      boardWidth <= 0 ||
      boardHeight <= 0
    ) {
      return 1;
    }

    const availableWidth = Math.max(1, frameSize.width - FIT_PADDING * 2);
    const availableHeight = Math.max(1, frameSize.height - FIT_PADDING * 2);

    const fitByWidth = availableWidth / boardWidth;
    const fitByHeight = availableHeight / boardHeight;

    return clamp(Math.min(fitByWidth, fitByHeight), MIN_ZOOM, MAX_ZOOM);
  }, [boardHeight, boardWidth, frameSize.height, frameSize.width]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const drawWidth = frameSize.width;
    const drawHeight = frameSize.height;

    if (drawWidth <= 0 || drawHeight <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(drawWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(drawHeight * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, drawWidth, drawHeight);

    const centerX = drawWidth / 2 + offsetRef.current.x;
    const centerY = drawHeight / 2 + offsetRef.current.y;
    const boardCenterX = boardWidth / 2;
    const boardCenterY = boardHeight / 2;
    const beadRadius = (bead / 2) * scale;

    const minBoardX = boardCenterX + (0 - centerX) / scale - bead;
    const maxBoardX = boardCenterX + (drawWidth - centerX) / scale + bead;
    const minBoardY = boardCenterY + (0 - centerY) / scale - bead;
    const maxBoardY = boardCenterY + (drawHeight - centerY) / scale + bead;

    const ultraLite = beadPoints.length > 6000 || scale < 0.12;
    const lite = beadPoints.length > 2500 || scale < 0.2;

    for (let index = 0; index < beadPoints.length; index += 1) {
      const point = beadPoints[index];

      if (
        point.x > maxBoardX ||
        point.x + bead < minBoardX ||
        point.y > maxBoardY ||
        point.y + bead < minBoardY
      ) {
        continue;
      }

      const screenX = centerX + (point.x - boardCenterX) * scale;
      const screenY = centerY + (point.y - boardCenterY) * scale;

      if (beadRadius < 0.25) continue;

      context.beginPath();
      context.arc(
        screenX + beadRadius,
        screenY + beadRadius,
        beadRadius,
        0,
        Math.PI * 2,
      );

      if (ultraLite) {
        context.fillStyle = "#eceef1";
        context.fill();
        continue;
      }

      context.fillStyle = point.color === baseColor ? "#f4f5f7" : point.color;
      context.fill();

      if (!lite) {
        context.lineWidth = Math.max(0.75, scale * 0.9);
        context.strokeStyle =
          point.color === baseColor
            ? "rgba(0,0,0,0.10)"
            : "rgba(0,0,0,0.18)";
        context.stroke();
      }
    }
  }, [beadPoints, boardHeight, boardWidth, frameSize.height, frameSize.width, scale]);

  const redraw = useCallback(() => {
    requestDraw(draw);
  }, [draw, requestDraw]);

  const fit = useCallback(() => {
    offsetRef.current = { x: 0, y: 0 };
    setScale(getFitScale());
  }, [getFitScale]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();

      setFrameSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    fit();
  }, [fit, width, height]);

  useEffect(() => {
    redraw();
  }, [redraw, scale, frameSize.width, frameSize.height, width, height]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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

    offsetRef.current = {
      x: offsetRef.current.x + dx,
      y: offsetRef.current.y + dy,
    };

    lastPoint.current = point;
    redraw();
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
        <div style={viewport}>
          <div ref={frameRef} style={frame}>
            <canvas ref={canvasRef} style={canvasStyle} />
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
  overflow: "hidden",
};

const frame: React.CSSProperties = {
  position: "absolute",
  top: 18,
  right: 72,
  bottom: 18,
  left: 18,
  overflow: "hidden",
};

const canvasStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};