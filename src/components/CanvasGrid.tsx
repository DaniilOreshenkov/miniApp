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

type Cell = {
  color: string;
};

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
const FIT_PADDING = 16;

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

  const cells = useMemo<Cell[][]>(() => {
    return Array.from({ length: rowCount }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex) }, () => ({
        color: baseColor,
      })),
    );
  }, [getRowLength, rowCount]);

  const beadPoints = useMemo<BeadPoint[]>(() => {
    const points: BeadPoint[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowLength = getRowLength(rowIndex);
      const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

      for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
        points.push({
          x: rowStartX + columnIndex * xStep,
          y: rowIndex * yStep,
          color: cells[rowIndex][columnIndex].color,
        });
      }
    }

    return points;
  }, [cells, getRowLength, maxRowLength, rowCount]);

  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });

  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });
  const [scale, setScale] = useState(1);

  const getFitScale = useCallback(() => {
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
  }, [boardHeight, boardWidth, viewportSize.height, viewportSize.width]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width: viewWidth, height: viewHeight } = viewportSize;
    if (viewWidth <= 0 || viewHeight <= 0) return;

    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(viewWidth * devicePixelRatio));
    const pixelHeight = Math.max(1, Math.round(viewHeight * devicePixelRatio));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${viewWidth}px`;
      canvas.style.height = `${viewHeight}px`;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, viewWidth, viewHeight);

    const centerX = viewWidth / 2 + offsetRef.current.x;
    const centerY = viewHeight / 2 + offsetRef.current.y;
    const boardCenterX = boardWidth / 2;
    const boardCenterY = boardHeight / 2;
    const radius = bead / 2;

    const minBoardX = boardCenterX + (0 - centerX) / scale - bead;
    const maxBoardX = boardCenterX + (viewWidth - centerX) / scale + bead;
    const minBoardY = boardCenterY + (0 - centerY) / scale - bead;
    const maxBoardY = boardCenterY + (viewHeight - centerY) / scale + bead;

    const useUltraSimple = beadPoints.length > 5000 || scale < 0.12;
    const useSimple = beadPoints.length > 2000 || scale < 0.22;

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
      const scaledRadius = radius * scale;

      if (scaledRadius < 0.25) continue;

      context.beginPath();
      context.arc(
        screenX + scaledRadius,
        screenY + scaledRadius,
        scaledRadius,
        0,
        Math.PI * 2,
      );

      if (useUltraSimple) {
        context.fillStyle =
          point.color === baseColor ? "rgba(235, 237, 240, 0.95)" : point.color;
        context.fill();
        continue;
      }

      context.fillStyle =
        point.color === baseColor ? "rgba(245, 246, 248, 1)" : point.color;
      context.fill();

      if (!useSimple) {
        context.lineWidth = Math.max(0.6, scale * 0.9);
        context.strokeStyle =
          point.color === baseColor
            ? "rgba(0, 0, 0, 0.12)"
            : "rgba(0, 0, 0, 0.18)";
        context.stroke();
      }
    }
  }, [beadPoints, boardHeight, boardWidth, scale, viewportSize]);

  const requestDraw = useCallback(() => {
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      draw();
    });
  }, [draw]);

  const fit = useCallback(() => {
    offsetRef.current = { x: 0, y: 0 };
    const nextScale = getFitScale();
    setScale(nextScale);
    requestDraw();
  }, [getFitScale, requestDraw]);

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

  useEffect(() => {
    fit();
  }, [fit, width, height]);

  useEffect(() => {
    requestDraw();
  }, [requestDraw, scale, viewportSize, width, height]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
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
    requestDraw();
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
          <canvas ref={canvasRef} style={canvasStyle} />
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

const canvasStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};