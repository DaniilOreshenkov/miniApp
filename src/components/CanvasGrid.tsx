import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

type Tool = "move" | "brush" | "erase" | "add" | "deactivate" | "ruler";

export interface CanvasGridHandle {
  exportPng: (fileName?: string) => void;
  createPngPreview: () => Promise<string | null>;
}

interface Props {
  tool: Tool;
  width: number;
  height: number;
  activeColor: string;
  toolSize?: number;
  rulerResetKey?: number;
  cells?: string[];
  onCellsChange?: (cells: string[]) => void;
}

type BeadPoint = {
  x: number;
  y: number;
  color: string;
};

type RulerPoint = {
  x: number;
  y: number;
};

type RulerState = {
  start: RulerPoint;
  end: RulerPoint;
};

type RulerDragMode = "start" | "end" | "body" | null;

const baseColor = "#ffffff";
const inactiveCellColor = "__inactive__";
const inactiveFill = "rgba(255,255,255,0.34)";
const inactiveStroke = "rgba(17,17,17,0.12)";

const isInactiveColor = (color: string) => color === inactiveCellColor;

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
  ({ tool, width, height, activeColor, toolSize = 1, rulerResetKey = 0, cells, onCellsChange }, ref) => {
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
    const tapStartPointRef = useRef<{ x: number; y: number } | null>(null);
    const tapStillValidRef = useRef(false);
    const rulerDragRef = useRef<{
      mode: RulerDragMode;
      startBoardPoint: RulerPoint | null;
      startRuler: RulerState | null;
    }>({
      mode: null,
      startBoardPoint: null,
      startRuler: null,
    });

    const [viewportSize, setViewportSize] = useState({
      width: 0,
      height: 0,
    });
    const [scale, setScale] = useState(1);
    const [previewCellIndex, setPreviewCellIndex] = useState<number | null>(null);
    const [ruler, setRuler] = useState<RulerState | null>(null);
    const rulerRef = useRef<RulerState | null>(null);

    const boardWidth = (maxRowLength - 1) * xStep + bead;
    const boardHeight = (rowCount - 1) * yStep + bead;
    const safeToolSize = clamp(Math.round(toolSize), 1, 8);

    const syncRuler = useCallback((nextRuler: RulerState | null) => {
      rulerRef.current = nextRuler;
      setRuler(nextRuler);
    }, []);

    const createDefaultRuler = useCallback((): RulerState => {
      const centerX = boardWidth / 2;
      const centerY = boardHeight / 2;
      const length = Math.max(
        xStep * 4,
        Math.min(boardWidth * 0.42, boardHeight * 0.42, xStep * 10),
      );

      return {
        start: {
          x: centerX - length / 2,
          y: centerY,
        },
        end: {
          x: centerX + length / 2,
          y: centerY,
        },
      };
    }, [boardHeight, boardWidth]);

    useEffect(() => {
      if (areArraysEqual(cellColorsRef.current, initialColors)) return;

      setCellColors(initialColors);
      cellColorsRef.current = initialColors;
      setUndoStack([]);
      setRedoStack([]);
      strokeSnapshotRef.current = null;
      strokeHasChangesRef.current = false;
    }, [initialColors]);

    useEffect(() => {
      if (tool !== "ruler") {
        rulerDragRef.current = {
          mode: null,
          startBoardPoint: null,
          startRuler: null,
        };
        return;
      }

      if (!rulerRef.current) {
        syncRuler(createDefaultRuler());
      }
    }, [createDefaultRuler, syncRuler, tool]);

    useEffect(() => {
      if (tool !== "ruler") return;

      syncRuler(createDefaultRuler());
    }, [createDefaultRuler, rulerResetKey, syncRuler, tool]);

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

        if (radius < 0.25) continue;

        const isInactive = isInactiveColor(point.color);
        const visibleRadius = isInactive
          ? Math.max(radius * 0.58, Math.min(radius, 2.2))
          : radius;

        context.beginPath();
        context.arc(
          screenX + radius,
          screenY + radius,
          visibleRadius,
          0,
          Math.PI * 2,
        );

        if (ultraLite) {
          context.fillStyle = isInactive
            ? "rgba(236,238,241,0.42)"
            : point.color === baseColor
              ? "#eceef1"
              : point.color;
          context.fill();
          continue;
        }

        context.fillStyle = isInactive
          ? inactiveFill
          : point.color === baseColor
            ? "#f4f5f7"
            : point.color;
        context.fill();

        if (!lite) {
          context.lineWidth = Math.max(0.75, scale * 0.9);
          context.strokeStyle = isInactive
            ? inactiveStroke
            : point.color === baseColor
              ? "rgba(0,0,0,0.10)"
              : "rgba(0,0,0,0.18)";
          context.stroke();
        }
      }

      if (tool === "ruler" && ruler) {
        const startX = centerX + (ruler.start.x - boardCenterX) * scale;
        const startY = centerY + (ruler.start.y - boardCenterY) * scale;
        const endX = centerX + (ruler.end.x - boardCenterX) * scale;
        const endY = centerY + (ruler.end.y - boardCenterY) * scale;
        const handleRadius = clamp(9 * Math.max(scale, 0.9), 9, 15);
        const distance = Math.max(
          0,
          Math.round(
            Math.hypot(
              (ruler.end.x - ruler.start.x) / xStep,
              (ruler.end.y - ruler.start.y) / yStep,
            ),
          ),
        );
        const middleX = (startX + endX) / 2;
        const middleY = (startY + endY) / 2;
        const label = distance === 1 ? "1 кружок" : String(distance) + " кружков";

        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        context.shadowColor = "rgba(0,0,0,0.34)";
        context.shadowBlur = 12;
        context.lineWidth = 8;
        context.strokeStyle = "rgba(17,18,22,0.42)";
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();

        context.shadowBlur = 0;
        context.lineWidth = 4;
        context.strokeStyle = "rgba(255,255,255,0.96)";
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();

        for (const handle of [ruler.start, ruler.end]) {
          const handleX = centerX + (handle.x - boardCenterX) * scale;
          const handleY = centerY + (handle.y - boardCenterY) * scale;

          context.beginPath();
          context.arc(handleX, handleY, handleRadius, 0, Math.PI * 2);
          context.fillStyle = "rgba(255,255,255,0.98)";
          context.fill();
          context.lineWidth = 3;
          context.strokeStyle = "rgba(184,93,106,0.95)";
          context.stroke();
        }

        context.font = "800 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        const labelWidth = context.measureText(label).width;
        const labelPaddingX = 10;
        const labelHeight = 28;
        const labelX = middleX - labelWidth / 2 - labelPaddingX;
        const labelY = middleY - 42;

        context.beginPath();
        context.roundRect(
          labelX,
          labelY,
          labelWidth + labelPaddingX * 2,
          labelHeight,
          12,
        );
        context.fillStyle = "rgba(17,18,22,0.9)";
        context.fill();
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, middleX, labelY + labelHeight / 2 + 0.5);
        context.restore();
      }

      if (
        previewCellIndex !== null &&
        previewCellIndex >= 0 &&
        previewCellIndex < beadPoints.length &&
        (tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate")
      ) {
        const point = beadPoints[previewCellIndex];
        const screenX = centerX + (point.x - boardCenterX) * scale;
        const screenY = centerY + (point.y - boardCenterY) * scale;
        const previewRadius = bead * scale * 0.5;

        context.beginPath();
        context.arc(
          screenX + previewRadius,
          screenY + previewRadius,
          previewRadius + Math.max(2, scale * 1.6),
          0,
          Math.PI * 2,
        );
        context.lineWidth = Math.max(2, scale * 1.5);
        context.strokeStyle = "rgba(255,255,255,0.96)";
        context.stroke();
      }
    }, [
      beadPoints,
      boardHeight,
      boardWidth,
      previewCellIndex,
      ruler,
      scale,
      tool,
      viewportSize.height,
      viewportSize.width,
    ]);

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
        y: TOP_CONTROLS_RESERVED_HEIGHT / 5,
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

        if (isInactiveColor(point.color)) {
          continue;
        }

        const radius = bead / 2;
        const x = EXPORT_PADDING + point.x + radius;
        const y = EXPORT_PADDING + point.y + radius;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);

        context.fillStyle = point.color === baseColor ? "#f4f5f7" : point.color;
        context.fill();

        context.lineWidth = 1;
        context.strokeStyle =
          point.color === baseColor ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.18)";
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
    }, [
      redraw,
      scale,
      previewCellIndex,
      viewportSize.width,
      viewportSize.height,
      cellColors,
      ruler,
      width,
      height,
    ]);

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
      const hitRadius = bead * 0.68;

      if (dx * dx + dy * dy > hitRadius * hitRadius) {
        return null;
      }

      return rowStartIndices[rowIndex] + columnIndex;
    };

    const pushUndoSnapshot = (snapshot: string[]) => {
      setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snapshot]);
      setRedoStack([]);
    };

    const getScreenPointFromBoardPoint = (point: RulerPoint) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;

      const rect = viewport.getBoundingClientRect();
      const centerX = rect.width / 2 + offsetRef.current.x;
      const centerY = rect.height / 2 + offsetRef.current.y;
      const boardCenterX = boardWidth / 2;
      const boardCenterY = boardHeight / 2;

      return {
        x: centerX + (point.x - boardCenterX) * scale,
        y: centerY + (point.y - boardCenterY) * scale,
      };
    };

    const getDistanceToSegment = (
      point: RulerPoint,
      segmentStart: RulerPoint,
      segmentEnd: RulerPoint,
    ) => {
      const dx = segmentEnd.x - segmentStart.x;
      const dy = segmentEnd.y - segmentStart.y;
      const lengthSquared = dx * dx + dy * dy;

      if (lengthSquared <= 0) {
        return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
      }

      const t = clamp(
        ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
          lengthSquared,
        0,
        1,
      );

      const projectionX = segmentStart.x + dx * t;
      const projectionY = segmentStart.y + dy * t;

      return Math.hypot(point.x - projectionX, point.y - projectionY);
    };

    const getRulerHitAtClientPoint = (
      clientX: number,
      clientY: number,
    ): RulerDragMode => {
      const currentRuler = rulerRef.current;
      if (!currentRuler) return null;

      const localPoint = getLocalPointFromClient(clientX, clientY);
      const startPoint = getScreenPointFromBoardPoint(currentRuler.start);
      const endPoint = getScreenPointFromBoardPoint(currentRuler.end);

      if (!localPoint || !startPoint || !endPoint) return null;

      const pointer = {
        x: localPoint.x,
        y: localPoint.y,
      };
      const handleHitRadius = 26;

      if (Math.hypot(pointer.x - startPoint.x, pointer.y - startPoint.y) <= handleHitRadius) {
        return "start";
      }

      if (Math.hypot(pointer.x - endPoint.x, pointer.y - endPoint.y) <= handleHitRadius) {
        return "end";
      }

      if (getDistanceToSegment(pointer, startPoint, endPoint) <= 18) {
        return "body";
      }

      return null;
    };

    const applyPaintAtClientPoint = (clientX: number, clientY: number) => {
      if (tool !== "brush" && tool !== "erase" && tool !== "add" && tool !== "deactivate") return;

      const boardPoint = getBoardPointFromClient(clientX, clientY);
      if (!boardPoint) return;

      const cellIndex = getCellIndexAtBoardPoint(boardPoint.x, boardPoint.y);
      if (cellIndex === null) return;

      const currentColors = cellColorsRef.current;
      const centerPoint = beadPoints[cellIndex];
      if (!centerPoint) return;

      const centerX = centerPoint.x + bead / 2;
      const centerY = centerPoint.y + bead / 2;
      const paintRadius = safeToolSize <= 1 ? 0 : Math.max(xStep, yStep) * (safeToolSize - 1) * 0.78;
      const next = [...currentColors];
      let hasChanges = false;

      for (let index = 0; index < beadPoints.length; index += 1) {
        const point = beadPoints[index];

        if (safeToolSize > 1) {
          const pointCenterX = point.x + bead / 2;
          const pointCenterY = point.y + bead / 2;
          const dx = pointCenterX - centerX;
          const dy = pointCenterY - centerY;

          if (dx * dx + dy * dy > paintRadius * paintRadius) {
            continue;
          }
        } else if (index !== cellIndex) {
          continue;
        }

        const currentColor = currentColors[index] ?? baseColor;
        const isInactive = isInactiveColor(currentColor);
        let nextColor: string | null = null;

        if (tool === "deactivate") {
          nextColor = inactiveCellColor;
        }

        if (tool === "add") {
          if (!isInactive) continue;
          nextColor = baseColor;
        }

        if (tool === "brush") {
          if (isInactive) continue;
          nextColor = activeColor;
        }

        if (tool === "erase") {
          if (isInactive) continue;
          nextColor = baseColor;
        }

        if (nextColor === null || currentColor === nextColor) {
          continue;
        }

        next[index] = nextColor;
        hasChanges = true;
      }

      if (!hasChanges) {
        return;
      }

      if (!strokeHasChangesRef.current) {
        strokeHasChangesRef.current = true;
        pushUndoSnapshot(strokeSnapshotRef.current ?? currentColors);
      }

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
      clearPreview();
      dragging.current = false;
      painting.current = false;
      rulerDragRef.current = {
        mode: null,
        startBoardPoint: null,
        startRuler: null,
      };
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

    const updatePreviewAtClientPoint = (clientX: number, clientY: number) => {
      if (tool !== "brush" && tool !== "erase" && tool !== "add" && tool !== "deactivate") {
        setPreviewCellIndex(null);
        return;
      }

      const boardPoint = getBoardPointFromClient(clientX, clientY);

      if (!boardPoint) {
        setPreviewCellIndex(null);
        return;
      }

      const cellIndex = getCellIndexAtBoardPoint(boardPoint.x, boardPoint.y);
      setPreviewCellIndex(cellIndex);
    };

    const clearPreview = () => {
      setPreviewCellIndex(null);
    };

    const startPan = (e: React.MouseEvent | React.TouchEvent) => {
      if ("touches" in e && e.touches.length >= 2) {
        startPinch(e);
        return;
      }

      if (isPinchingRef.current) return;

      const point = getClientPoint(e);

      updatePreviewAtClientPoint(point.x, point.y);
      tapStartPointRef.current = point;
      tapStillValidRef.current = true;

      if (tool === "ruler") {
        const boardPoint = getBoardPointFromClient(point.x, point.y);
        if (!boardPoint) return;

        const currentRuler = rulerRef.current ?? createDefaultRuler();
        const hitMode = getRulerHitAtClientPoint(point.x, point.y);

        if (!rulerRef.current) {
          syncRuler(currentRuler);
        }

        rulerDragRef.current = {
          mode: hitMode ?? "end",
          startBoardPoint: boardPoint,
          startRuler: hitMode ? currentRuler : { start: boardPoint, end: boardPoint },
        };

        if (!hitMode) {
          syncRuler({
            start: boardPoint,
            end: boardPoint,
          });
        }

        clearPreview();
        return;
      }

      if (tool === "move") {
        dragging.current = true;
        lastPoint.current = point;
        return;
      }

      if (tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate") {
        painting.current = true;
        strokeSnapshotRef.current = [...cellColorsRef.current];
        strokeHasChangesRef.current = false;

        // Важно: одинарный тап должен красить/стирать сразу, без необходимости вести пальцем.
        applyPaintAtClientPoint(point.x, point.y);
      }
    };

    const movePan = (e: React.MouseEvent | React.TouchEvent) => {
      if ("touches" in e && e.touches.length >= 2) {
        tapStillValidRef.current = false;

        if (!isPinchingRef.current) {
          startPinch(e);
          return;
        }

        updatePinch(e);
        return;
      }

      if (isPinchingRef.current) return;

      const point = getClientPoint(e);

      updatePreviewAtClientPoint(point.x, point.y);
      const tapStartPoint = tapStartPointRef.current;

      if (tapStartPoint) {
        const dx = point.x - tapStartPoint.x;
        const dy = point.y - tapStartPoint.y;

        if (Math.hypot(dx, dy) > 7) {
          tapStillValidRef.current = false;
        }
      }

      if (tool === "ruler") {
        const drag = rulerDragRef.current;
        const boardPoint = getBoardPointFromClient(point.x, point.y);

        if (!boardPoint || !drag.mode || !drag.startBoardPoint || !drag.startRuler) {
          return;
        }

        if (drag.mode === "start") {
          syncRuler({
            start: boardPoint,
            end: drag.startRuler.end,
          });
          return;
        }

        if (drag.mode === "end") {
          syncRuler({
            start: drag.startRuler.start,
            end: boardPoint,
          });
          return;
        }

        const dx = boardPoint.x - drag.startBoardPoint.x;
        const dy = boardPoint.y - drag.startBoardPoint.y;

        syncRuler({
          start: {
            x: drag.startRuler.start.x + dx,
            y: drag.startRuler.start.y + dy,
          },
          end: {
            x: drag.startRuler.end.x + dx,
            y: drag.startRuler.end.y + dy,
          },
        });
        return;
      }

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

      if ((tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate") && painting.current) {
        applyPaintAtClientPoint(point.x, point.y);
      }
    };

    const stopPan = (e?: React.MouseEvent | React.TouchEvent) => {
      if (e && "touches" in e && isPinchingRef.current && e.touches.length > 0) {
        return;
      }

      const shouldApplyTap =
        !isPinchingRef.current &&
        tapStillValidRef.current &&
        (tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate") &&
        tapStartPointRef.current !== null;

      if (shouldApplyTap && tapStartPointRef.current) {
        applyPaintAtClientPoint(
          tapStartPointRef.current.x,
          tapStartPointRef.current.y,
        );
      }

      dragging.current = false;
      painting.current = false;
      isPinchingRef.current = false;
      clearPreview();
      tapStartPointRef.current = null;
      tapStillValidRef.current = false;
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
  padding: "0 10px",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  background: "rgba(17,18,22,0.92)",
  border: "1px solid rgba(255,255,255,0.24)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: 0.1,
  boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
  backdropFilter: "blur(14px)",
};

const controlButton: React.CSSProperties = {
  width: BUTTON_WIDTH,
  height: BUTTON_HEIGHT,
  border: "1px solid rgba(255,255,255,0.24)",
  borderRadius: 12,
  background: "rgba(17,18,22,0.92)",
  color: "#ffffff",
  fontSize: 19,
  fontWeight: 900,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 0,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
  backdropFilter: "blur(14px)",
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
  width: 2,
  height: 24,
  borderRadius: 999,
  background: "rgba(17,18,22,0.86)",
  boxShadow: "0 6px 14px rgba(0,0,0,0.2)",
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
