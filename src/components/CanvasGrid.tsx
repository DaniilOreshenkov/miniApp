import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

type Tool = "move" | "brush" | "erase";

export interface CanvasGridHandle {
  exportPng: (fileName?: string) => void;
  createPngPreview: () => Promise<string | null>;
}

interface Props {
  tool: Tool;
  width: number;
  height: number;
  activeColor: string;
  cells?: string[];
  onCellsChange?: (cells: string[]) => void;
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
const ZOOM_FACTOR = 1.18;
const FIT_PADDING = 12;
const MAX_HISTORY = 40;

const CONTROLS_TOP = 12;
const CONTROLS_GAP = 6;
const BADGE_WIDTH = 58;
const BADGE_HEIGHT = 36;
const BUTTON_WIDTH = 38;
const BUTTON_HEIGHT = 36;
const FIT_BUTTON_WIDTH = 48;
const DIVIDER_WIDTH = 1;
const CONTROLS_SAFE_MARGIN = 10;
const TOP_CONTROLS_RESERVED_HEIGHT =
  CONTROLS_TOP + Math.max(BADGE_HEIGHT, BUTTON_HEIGHT) + CONTROLS_SAFE_MARGIN * 2;

const EXPORT_PADDING = 24;
const EXPORT_DPR = 2;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const areArraysEqual = (first: string[], second: string[]) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
};

const sanitizeFileName = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");

  return normalized || "beadly-project";
};

const trySharePng = async (blob: Blob, fileName: string) => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  const file = new File([blob], fileName, { type: "image/png" });
  const shareData: ShareData = {
    files: [file],
  };

  if (typeof navigator.canShare === "function" && !navigator.canShare(shareData)) {
    return false;
  }

  try {
    await navigator.share(shareData);
    return true;
  } catch {
    return false;
  }
};

const CanvasGrid = forwardRef<CanvasGridHandle, Props>(
  ({ tool, width, height, activeColor, cells, onCellsChange }, ref) => {
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

    const rowStartIndices = useMemo(() => {
      const starts: number[] = [];
      let currentIndex = 0;

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        starts.push(currentIndex);
        currentIndex += getRowLength(rowIndex);
      }

      return starts;
    }, [getRowLength, rowCount]);

    const totalCells = useMemo(() => {
      let count = 0;

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        count += getRowLength(rowIndex);
      }

      return count;
    }, [getRowLength, rowCount]);

    const initialColors = useMemo(() => {
      return Array.from({ length: totalCells }, (_, index) => {
        return cells?.[index] ?? baseColor;
      });
    }, [cells, totalCells]);

    const [cellColors, setCellColors] = useState<string[]>(initialColors);
    const cellColorsRef = useRef<string[]>(initialColors);

    const [undoStack, setUndoStack] = useState<string[][]>([]);
    const [redoStack, setRedoStack] = useState<string[][]>([]);

    const strokeSnapshotRef = useRef<string[] | null>(null);
    const strokeHasChangesRef = useRef(false);

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const dragging = useRef(false);
    const painting = useRef(false);
    const isPinchingRef = useRef(false);
    const lastPoint = useRef({ x: 0, y: 0 });
    const offsetRef = useRef({ x: 0, y: 0 });
    const pinchStartDistanceRef = useRef(0);
    const pinchStartScaleRef = useRef(1);
    const pinchStartOffsetRef = useRef({ x: 0, y: 0 });
    const pinchStartCenterRef = useRef({ x: 0, y: 0 });
    const pinchBoardPointRef = useRef({ x: 0, y: 0 });

    const [viewportSize, setViewportSize] = useState({
      width: 0,
      height: 0,
    });
    const [scale, setScale] = useState(1);

    const boardWidth = (maxRowLength - 1) * xStep + bead;
    const boardHeight = (rowCount - 1) * yStep + bead;

    useEffect(() => {
      if (areArraysEqual(cellColorsRef.current, initialColors)) return;

      setCellColors(initialColors);
      cellColorsRef.current = initialColors;
      setUndoStack([]);
      setRedoStack([]);
      strokeSnapshotRef.current = null;
      strokeHasChangesRef.current = false;
    }, [initialColors]);

    const beadPoints = useMemo<BeadPoint[]>(() => {
      const points: BeadPoint[] = [];
      let pointIndex = 0;

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const rowLength = getRowLength(rowIndex);
        const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

        for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
          points.push({
            x: rowStartX + columnIndex * xStep,
            y: rowIndex * yStep,
            color: cellColors[pointIndex] ?? baseColor,
          });

          pointIndex += 1;
        }
      }

      return points;
    }, [cellColors, getRowLength, maxRowLength, rowCount]);

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
      const availableHeight = Math.max(
        1,
        viewportSize.height - TOP_CONTROLS_RESERVED_HEIGHT - FIT_PADDING * 2,
      );

      const fitByWidth = availableWidth / boardWidth;
      const fitByHeight = availableHeight / boardHeight;

      return clamp(Math.min(fitByWidth, fitByHeight), MIN_ZOOM, MAX_ZOOM);
    }, [boardHeight, boardWidth, viewportSize.height, viewportSize.width]);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const drawWidth = viewportSize.width;
      const drawHeight = viewportSize.height;

      if (drawWidth <= 0 || drawHeight <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(drawWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(drawHeight * dpr));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${drawWidth}px`;
        canvas.style.height = `${drawHeight}px`;
      }

      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, drawWidth, drawHeight);

      const centerX = drawWidth / 2 + offsetRef.current.x;
      const centerY = drawHeight / 2 + offsetRef.current.y;
      const boardCenterX = boardWidth / 2;
      const boardCenterY = boardHeight / 2;
      const radius = (bead / 2) * scale;

      const minBoardX = boardCenterX + (0 - centerX) / scale - bead;
      const maxBoardX = boardCenterX + (drawWidth - centerX) / scale + bead;
      const minBoardY = boardCenterY + (0 - centerY) / scale - bead;
      const maxBoardY = boardCenterY + (drawHeight - centerY) / scale + bead;

      const safeZoneWidth =
        BUTTON_WIDTH * 4 +
        FIT_BUTTON_WIDTH +
        BADGE_WIDTH +
        DIVIDER_WIDTH * 2 +
        CONTROLS_GAP * 8 +
        CONTROLS_SAFE_MARGIN * 2;
      const safeZoneHeight = TOP_CONTROLS_RESERVED_HEIGHT;

      const safeZoneX = drawWidth / 2 - safeZoneWidth / 2;
      const safeZoneY = 0;

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

        const beadLeft = screenX;
        const beadTop = screenY;
        const beadSize = bead * scale;
        const beadRight = beadLeft + beadSize;
        const beadBottom = beadTop + beadSize;

        const intersectsSafeZone =
          beadRight > safeZoneX &&
          beadLeft < safeZoneX + safeZoneWidth &&
          beadBottom > safeZoneY &&
          beadTop < safeZoneY + safeZoneHeight;

        if (intersectsSafeZone) {
          continue;
        }

        if (radius < 0.25) continue;

        context.beginPath();
        context.arc(
          screenX + radius,
          screenY + radius,
          radius,
          0,
          Math.PI * 2,
        );

        if (ultraLite) {
          context.fillStyle =
            point.color === baseColor ? "#eceef1" : point.color;
          context.fill();
          continue;
        }

        context.fillStyle =
          point.color === baseColor ? "#f4f5f7" : point.color;
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
    }, [beadPoints, boardHeight, boardWidth, scale, viewportSize.height, viewportSize.width]);

    const redraw = useCallback(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        draw();
      });
    }, [draw]);

    const applyCellColors = useCallback(
      (next: string[]) => {
        cellColorsRef.current = next;
        setCellColors(next);
        onCellsChange?.(next);
      },
      [onCellsChange],
    );

    const fit = useCallback(() => {
      offsetRef.current = {
        x: 0,
        y: TOP_CONTROLS_RESERVED_HEIGHT / 3,
      };
      setScale(getFitScale());
    }, [getFitScale]);

    const displayScalePercent = Math.round((scale / getFitScale()) * 100);

    const renderExportCanvas = useCallback(() => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(
        1,
        Math.round((boardWidth + EXPORT_PADDING * 2) * EXPORT_DPR),
      );
      canvas.height = Math.max(
        1,
        Math.round((boardHeight + EXPORT_PADDING * 2) * EXPORT_DPR),
      );

      const context = canvas.getContext("2d");
      if (!context) return null;

      context.scale(EXPORT_DPR, EXPORT_DPR);
      context.fillStyle = "#ffffff";
      context.fillRect(
        0,
        0,
        boardWidth + EXPORT_PADDING * 2,
        boardHeight + EXPORT_PADDING * 2,
      );

      for (let index = 0; index < beadPoints.length; index += 1) {
        const point = beadPoints[index];
        const radius = bead / 2;
        const x = EXPORT_PADDING + point.x + radius;
        const y = EXPORT_PADDING + point.y + radius;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);

        context.fillStyle = point.color === baseColor ? "#f4f5f7" : point.color;
        context.fill();

        context.lineWidth = 1;
        context.strokeStyle =
          point.color === baseColor
            ? "rgba(0,0,0,0.10)"
            : "rgba(0,0,0,0.18)";
        context.stroke();
      }

      return canvas;
    }, [beadPoints, boardHeight, boardWidth]);

    const exportPng = useCallback(
      (fileName = "beadly-project") => {
        const exportCanvas = renderExportCanvas();
        if (!exportCanvas) return;

        const safeName = `${sanitizeFileName(fileName)}.png`;

        exportCanvas.toBlob((blob) => {
          if (!blob) return;

          void trySharePng(blob, safeName);
        }, "image/png");
      },
      [renderExportCanvas],
    );

    const createPngPreview = useCallback(async () => {
      const exportCanvas = renderExportCanvas();
      if (!exportCanvas) return null;

      return exportCanvas.toDataURL("image/png");
    }, [renderExportCanvas]);

    useImperativeHandle(
      ref,
      () => ({
        exportPng,
        createPngPreview,
      }),
      [createPngPreview, exportPng],
    );

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
    }, [redraw, scale, viewportSize.width, viewportSize.height, cellColors, width, height]);

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }
      };
    }, []);

    const getClientPoint = (
      e: React.MouseEvent | React.TouchEvent,
    ): { x: number; y: number } => {
      if ("touches" in e) {
        const touch = e.touches[0] ?? e.changedTouches[0];
        return { x: touch.clientX, y: touch.clientY };
      }

      return { x: e.clientX, y: e.clientY };
    };

    const getTouchDistance = (first: React.Touch, second: React.Touch) => {
      const dx = second.clientX - first.clientX;
      const dy = second.clientY - first.clientY;

      return Math.hypot(dx, dy);
    };

    const getTouchCenter = (first: React.Touch, second: React.Touch) => {
      return {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };
    };

    const getLocalPointFromClient = (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;

      const rect = viewport.getBoundingClientRect();

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
    };

    const getBoardPointFromClient = (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;

      const rect = viewport.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      const centerX = rect.width / 2 + offsetRef.current.x;
      const centerY = rect.height / 2 + offsetRef.current.y;
      const boardCenterX = boardWidth / 2;
      const boardCenterY = boardHeight / 2;

      return {
        x: boardCenterX + (localX - centerX) / scale,
        y: boardCenterY + (localY - centerY) / scale,
      };
    };

    const getCellIndexAtBoardPoint = (boardX: number, boardY: number) => {
      const rowIndex = Math.round(boardY / yStep);

      if (rowIndex < 0 || rowIndex >= rowCount) return null;

      const rowLength = getRowLength(rowIndex);
      const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;
      const columnIndex = Math.round((boardX - rowStartX) / xStep);

      if (columnIndex < 0 || columnIndex >= rowLength) return null;

      const beadLeft = rowStartX + columnIndex * xStep;
      const beadTop = rowIndex * yStep;
      const centerX = beadLeft + bead / 2;
      const centerY = beadTop + bead / 2;

      const dx = boardX - centerX;
      const dy = boardY - centerY;
      const hitRadius = bead * 0.58;

      if (dx * dx + dy * dy > hitRadius * hitRadius) {
        return null;
      }

      return rowStartIndices[rowIndex] + columnIndex;
    };

    const pushUndoSnapshot = (snapshot: string[]) => {
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snapshot]);
      setRedoStack([]);
    };

    const applyPaintAtClientPoint = (clientX: number, clientY: number) => {
      if (tool !== "brush" && tool !== "erase") return;

      const boardPoint = getBoardPointFromClient(clientX, clientY);
      if (!boardPoint) return;

      const cellIndex = getCellIndexAtBoardPoint(boardPoint.x, boardPoint.y);
      if (cellIndex === null) return;

      const currentColors = cellColorsRef.current;
      const nextColor = tool === "erase" ? baseColor : activeColor;

      if (currentColors[cellIndex] === nextColor) {
        return;
      }

      if (!strokeHasChangesRef.current) {
        strokeHasChangesRef.current = true;
        pushUndoSnapshot(strokeSnapshotRef.current ?? currentColors);
      }

      const next = [...currentColors];
      next[cellIndex] = nextColor;
      applyCellColors(next);
    };

    const startPinch = (e: React.TouchEvent) => {
      if (e.touches.length < 2) return;

      e.preventDefault();

      const firstTouch = e.touches[0];
      const secondTouch = e.touches[1];
      const center = getTouchCenter(firstTouch, secondTouch);
      const localCenter = getLocalPointFromClient(center.x, center.y);
      const boardPoint = getBoardPointFromClient(center.x, center.y);

      if (!localCenter || !boardPoint) return;

      isPinchingRef.current = true;
      dragging.current = false;
      painting.current = false;
      strokeSnapshotRef.current = null;
      strokeHasChangesRef.current = false;

      pinchStartDistanceRef.current = Math.max(
        1,
        getTouchDistance(firstTouch, secondTouch),
      );
      pinchStartScaleRef.current = scale;
      pinchStartOffsetRef.current = { ...offsetRef.current };
      pinchStartCenterRef.current = {
        x: localCenter.x,
        y: localCenter.y,
      };
      pinchBoardPointRef.current = boardPoint;
    };

    const updatePinch = (e: React.TouchEvent) => {
      if (!isPinchingRef.current || e.touches.length < 2) return;

      e.preventDefault();

      const firstTouch = e.touches[0];
      const secondTouch = e.touches[1];
      const center = getTouchCenter(firstTouch, secondTouch);
      const localCenter = getLocalPointFromClient(center.x, center.y);

      if (!localCenter) return;

      const nextDistance = Math.max(1, getTouchDistance(firstTouch, secondTouch));
      const distanceRatio = nextDistance / pinchStartDistanceRef.current;
      const nextScale = clamp(
        pinchStartScaleRef.current * distanceRatio,
        MIN_ZOOM,
        MAX_ZOOM,
      );

      const boardPoint = pinchBoardPointRef.current;
      const boardCenterX = boardWidth / 2;
      const boardCenterY = boardHeight / 2;

      const nextOffset = {
        x:
          localCenter.x -
          localCenter.width / 2 -
          (boardPoint.x - boardCenterX) * nextScale,
        y:
          localCenter.y -
          localCenter.height / 2 -
          (boardPoint.y - boardCenterY) * nextScale,
      };

      offsetRef.current = nextOffset;
      setScale(nextScale);
    };

    const startPan = (e: React.MouseEvent | React.TouchEvent) => {
      if ("touches" in e && e.touches.length >= 2) {
        startPinch(e);
        return;
      }

      if (isPinchingRef.current) return;

      const point = getClientPoint(e);

      if (tool === "move") {
        dragging.current = true;
        lastPoint.current = point;
        return;
      }

      if (tool === "brush" || tool === "erase") {
        painting.current = true;
        strokeSnapshotRef.current = [...cellColorsRef.current];
        strokeHasChangesRef.current = false;
        applyPaintAtClientPoint(point.x, point.y);
      }
    };

    const movePan = (e: React.MouseEvent | React.TouchEvent) => {
      if ("touches" in e && e.touches.length >= 2) {
        if (!isPinchingRef.current) {
          startPinch(e);
          return;
        }

        updatePinch(e);
        return;
      }

      if (isPinchingRef.current) return;

      const point = getClientPoint(e);

      if (tool === "move") {
        if (!dragging.current) return;

        const dx = point.x - lastPoint.current.x;
        const dy = point.y - lastPoint.current.y;

        offsetRef.current = {
          x: offsetRef.current.x + dx,
          y: offsetRef.current.y + dy,
        };

        lastPoint.current = point;
        redraw();
        return;
      }

      if ((tool === "brush" || tool === "erase") && painting.current) {
        applyPaintAtClientPoint(point.x, point.y);
      }
    };

    const stopPan = (e?: React.MouseEvent | React.TouchEvent) => {
      if (e && "touches" in e && isPinchingRef.current && e.touches.length > 0) {
        return;
      }

      dragging.current = false;
      painting.current = false;
      isPinchingRef.current = false;
      strokeSnapshotRef.current = null;
      strokeHasChangesRef.current = false;
    };

    const zoomAtClientPoint = (clientX: number, clientY: number, nextScale: number) => {
      const localPoint = getLocalPointFromClient(clientX, clientY);
      const boardPoint = getBoardPointFromClient(clientX, clientY);

      if (!localPoint || !boardPoint) {
        setScale(nextScale);
        return;
      }

      const boardCenterX = boardWidth / 2;
      const boardCenterY = boardHeight / 2;

      offsetRef.current = {
        x:
          localPoint.x -
          localPoint.width / 2 -
          (boardPoint.x - boardCenterX) * nextScale,
        y:
          localPoint.y -
          localPoint.height / 2 -
          (boardPoint.y - boardCenterY) * nextScale,
      };

      setScale(nextScale);
    };

    const zoomByFactorAtCenter = (factor: number) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        setScale((prev) => clamp(prev * factor, MIN_ZOOM, MAX_ZOOM));
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      zoomAtClientPoint(centerX, centerY, clamp(scale * factor, MIN_ZOOM, MAX_ZOOM));
    };

    const zoomIn = () => {
      zoomByFactorAtCenter(ZOOM_FACTOR);
    };

    const zoomOut = () => {
      zoomByFactorAtCenter(1 / ZOOM_FACTOR);
    };

    const handleWheelZoom = (event: React.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const wheelFactor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const nextScale = clamp(scale * wheelFactor, MIN_ZOOM, MAX_ZOOM);

      zoomAtClientPoint(event.clientX, event.clientY, nextScale);
    };

    const undo = () => {
      if (undoStack.length === 0) return;

      const previous = undoStack[undoStack.length - 1];
      const current = cellColorsRef.current;

      setUndoStack((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), current]);

      applyCellColors(previous);
    };

    const redo = () => {
      if (redoStack.length === 0) return;

      const next = redoStack[redoStack.length - 1];
      const current = cellColorsRef.current;

      setRedoStack((prev) => prev.slice(0, -1));
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), current]);

      applyCellColors(next);
    };

    return (
      <div style={wrapper}>
        <div style={controls}>
          <button
            type="button"
            onClick={undo}
            style={{
              ...controlButton,
              opacity: undoStack.length > 0 ? 1 : 0.36,
              cursor: undoStack.length > 0 ? "pointer" : "default",
            }}
            disabled={undoStack.length === 0}
            aria-label="Отменить"
            title="Отменить"
          >
            ↺
          </button>

          <button
            type="button"
            onClick={redo}
            style={{
              ...controlButton,
              opacity: redoStack.length > 0 ? 1 : 0.36,
              cursor: redoStack.length > 0 ? "pointer" : "default",
            }}
            disabled={redoStack.length === 0}
            aria-label="Повторить"
            title="Повторить"
          >
            ↻
          </button>

          <div style={controlDivider} />

          <button
            type="button"
            onClick={zoomOut}
            style={controlButton}
            aria-label="Уменьшить"
            title="Уменьшить"
          >
            −
          </button>

          <div style={percentBadge}>{displayScalePercent}%</div>

          <button
            type="button"
            onClick={zoomIn}
            style={controlButton}
            aria-label="Увеличить"
            title="Увеличить"
          >
            +
          </button>

          <div style={controlDivider} />

          <button
            type="button"
            onClick={fit}
            style={fitButton}
            aria-label="Вернуть масштаб 100%"
            title="Вернуть масштаб 100%"
          >
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
          onTouchCancel={stopPan}
          onWheel={handleWheelZoom}
        >
          <div ref={viewportRef} style={viewport}>
            <canvas ref={canvasRef} style={canvasStyle} />
          </div>
        </div>
      </div>
    );
  },
);

CanvasGrid.displayName = "CanvasGrid";

export default CanvasGrid;

const wrapper: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

const controls: React.CSSProperties = {
  position: "absolute",
  top: CONTROLS_TOP,
  left: "50%",
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: CONTROLS_GAP,
  padding: 6,
  borderRadius: 20,
  background: "transparent",
  border: "none",
  boxShadow: "none",
  backdropFilter: "none",
  transform: "translateX(-50%)",
  touchAction: "manipulation",
  WebkitUserSelect: "none",
  userSelect: "none",
};

const percentBadge: React.CSSProperties = {
  minWidth: BADGE_WIDTH,
  height: BADGE_HEIGHT,
  padding: "0 8px",
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  background: "rgba(27,29,34,0.66)",
  border: "none",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: 0.1,
  boxShadow: "none",
  backdropFilter: "blur(10px)",
};

const controlButton: React.CSSProperties = {
  width: BUTTON_WIDTH,
  height: BUTTON_HEIGHT,
  border: "none",
  borderRadius: 14,
  background: "rgba(27,29,34,0.58)",
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 0,
  cursor: "pointer",
  boxShadow: "none",
  backdropFilter: "blur(10px)",
  touchAction: "manipulation",
};

const fitButton: React.CSSProperties = {
  ...controlButton,
  width: FIT_BUTTON_WIDTH,
  fontSize: 13,
  lineHeight: 1,
  letterSpacing: 0.2,
};

const controlDivider: React.CSSProperties = {
  width: DIVIDER_WIDTH,
  height: 22,
  borderRadius: 999,
  background: "rgba(27,29,34,0.34)",
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

const canvasStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};
