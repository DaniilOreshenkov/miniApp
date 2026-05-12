import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

type Tool = "move" | "brush" | "erase" | "add" | "deactivate" | "ruler" | "shape" | "text" | "background";
type ShapeType = "oval" | "circle" | "square" | "triangle" | "cross" | "arrow" | "doubleArrow";
type TextStyle = "plain" | "bubble" | "shadow";
type CanvasPaddingPercent = 0 | 25 | 50;
type TextInteractionMode = "edit" | "move" | "rotate";
type ShapeInteractionMode = "move" | "rotate" | "size";

type TextBoxData = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type TextLayer = {
  id: number;
  value: string;
  color: string;
  size: number;
  style: TextStyle;
  rotation: number;
  box?: TextBoxData;
};

export interface CanvasGridHandle {
  exportPng: (fileName?: string) => void;
  createPngPreview: () => Promise<string | null>;
  applyCurrentShape: () => void;
  clearCurrentShape: () => void;
  addCurrentShape: (shapeType?: ShapeType) => void;
}

interface Props {
  tool: Tool;
  width: number;
  height: number;
  activeColor: string;
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  canvasPaddingPercent?: CanvasPaddingPercent;
  toolSize?: number;
  rulerVisible?: boolean;
  rulerLocked?: boolean;
  rulerSize?: number;
  rulerTextVisible?: boolean;
  shapeType?: ShapeType;
  textLayers?: TextLayer[];
  activeTextLayerId?: number;
  textSlotId?: number;
  textValue?: string;
  textSize?: number;
  textStyle?: TextStyle;
  textInteractionMode?: TextInteractionMode;
  shapeInteractionMode?: ShapeInteractionMode;
  shapeLayers?: ShapeLayer[];
  activeShapeLayerId?: string | null;
  cells?: string[];
  onCellsChange?: (cells: string[]) => void;
  onTextLayerSelect?: (layerId: number) => void;
  onTextLayerChange?: (layerId: number, updates: Partial<TextLayer>) => void;
  onTextCanvasPointerDown?: (layerId: number | null) => void;
  onShapeTypeChange?: (shapeType: ShapeType) => void;
  onShapeLayerChange?: (hasShapeLayer: boolean) => void;
  onShapeLayersChange?: (layers: ShapeLayer[], activeLayerId: string | null) => void;
  onShapeLayerSelect?: (layerId: string | null) => void;
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

type ShapeState = {
  start: RulerPoint;
  end: RulerPoint;
  rotation?: number;
};

export type ShapeLayer = ShapeState & {
  id: string;
  type: ShapeType;
  color: string;
};

type ShapeItem = ShapeLayer;

type ShapeDragMode = "start" | "end" | "body" | "rotate" | null;

type TextBoxState = ShapeState;

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
const DEFAULT_RULER_SCREEN_HEIGHT = 32;
const MIN_RULER_SCREEN_HEIGHT = 18;
const MAX_RULER_SCREEN_HEIGHT = 58;
const RULER_EDGE_DRAW_GAP = 1;
const RULER_GUIDE_START_HIT_DISTANCE_TOUCH = 48;
const RULER_GUIDE_START_HIT_DISTANCE_DESKTOP = 72;
const RULER_GUIDE_ACTIVE_HIT_DISTANCE_TOUCH = 220;
const RULER_GUIDE_ACTIVE_HIT_DISTANCE_DESKTOP = 360;

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

const EXPORT_PADDING = 40;
const EXPORT_INFO_GAP = 28;
const EXPORT_INFO_PANEL_PADDING = 24;
const EXPORT_INFO_HEADER_HEIGHT = 38;
const EXPORT_INFO_ROW_HEIGHT = 30;
const EXPORT_INFO_MIN_HEIGHT = 190;
const EXPORT_INFO_MIN_WIDTH = 720;
const EXPORT_INFO_MAX_COLOR_ROWS = 18;
const EXPORT_DPR = 2;
const MAX_EXPORT_IMAGE_SIDE = 4096;
const DEFAULT_TEXT_VALUE = "Text";
const MIN_TEXT_SIZE = 14;
const MAX_TEXT_SIZE = 92;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const shouldDrawBackgroundColor = (color: string) => {
  return color.trim().toLowerCase() !== "transparent";
};

type BeadCountItem = {
  color: string;
  count: number;
};

const getReadableColorName = (color: string) => {
  const normalizedColor = color.trim().toLowerCase();

  if (normalizedColor === "#ffffff") return "Белый";
  if (normalizedColor === "#000000" || normalizedColor === "#111111") return "Чёрный";

  return normalizedColor.toUpperCase();
};

const getExportInfoPanelHeight = (visibleRows: number) => {
  return Math.max(
    EXPORT_INFO_MIN_HEIGHT,
    EXPORT_INFO_PANEL_PADDING * 2 +
      EXPORT_INFO_HEADER_HEIGHT +
      Math.max(1, visibleRows) * EXPORT_INFO_ROW_HEIGHT +
      18,
  );
};

const drawCoverImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
) => {
  const imageRatio = image.width / Math.max(1, image.height);
  const targetRatio = targetWidth / Math.max(1, targetHeight);
  const sourceWidth = imageRatio > targetRatio ? image.height * targetRatio : image.width;
  const sourceHeight = imageRatio > targetRatio ? image.height : image.width / targetRatio;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
  );
};

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
};

const drawBeadCountPanel = (
  context: CanvasRenderingContext2D,
  items: BeadCountItem[],
  totalCount: number,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  drawRoundedRect(context, x, y, width, height, 28);
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(17,17,17,0.12)";
  context.stroke();

  const contentX = x + EXPORT_INFO_PANEL_PADDING;
  const contentWidth = width - EXPORT_INFO_PANEL_PADDING * 2;
  const titleY = y + EXPORT_INFO_PANEL_PADDING;

  context.fillStyle = "rgba(17,17,17,0.92)";
  context.font = "700 26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textBaseline = "top";
  context.fillText("Подсчёт бусин", contentX, titleY);

  context.font = "500 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillStyle = "rgba(17,17,17,0.58)";
  context.textAlign = "right";
  context.fillText(`Всего: ${totalCount}`, x + width - EXPORT_INFO_PANEL_PADDING, titleY + 5);
  context.textAlign = "left";

  const rowsStartY = titleY + EXPORT_INFO_HEADER_HEIGHT + 12;
  const visibleItems = items.slice(0, EXPORT_INFO_MAX_COLOR_ROWS);
  const hiddenItemsCount = Math.max(0, items.length - visibleItems.length);
  const columnGap = 26;
  const columnCount = contentWidth >= 760 ? 2 : 1;
  const columnWidth = (contentWidth - columnGap * (columnCount - 1)) / columnCount;

  visibleItems.forEach((item, index) => {
    const columnIndex = columnCount === 2 ? index % 2 : 0;
    const rowIndex = columnCount === 2 ? Math.floor(index / 2) : index;
    const rowX = contentX + columnIndex * (columnWidth + columnGap);
    const rowY = rowsStartY + rowIndex * EXPORT_INFO_ROW_HEIGHT;
    const swatchSize = 18;

    context.beginPath();
    context.arc(rowX + swatchSize / 2, rowY + swatchSize / 2 + 2, swatchSize / 2, 0, Math.PI * 2);
    context.fillStyle = item.color === baseColor ? "#f4f5f7" : item.color;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = "rgba(0,0,0,0.18)";
    context.stroke();

    context.font = "500 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillStyle = "rgba(17,17,17,0.88)";
    context.textBaseline = "top";
    context.fillText(getReadableColorName(item.color), rowX + 30, rowY);

    context.font = "700 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.textAlign = "right";
    context.fillText(String(item.count), rowX + columnWidth, rowY);
    context.textAlign = "left";
  });

  if (hiddenItemsCount > 0) {
    context.font = "500 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillStyle = "rgba(17,17,17,0.52)";
    context.fillText(
      `Ещё цветов: ${hiddenItemsCount}`,
      contentX,
      y + height - EXPORT_INFO_PANEL_PADDING - 18,
    );
  }
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
  ({
    tool,
    width,
    height,
    activeColor,
    backgroundColor = "#ffffff",
    backgroundImageUrl = null,
    canvasPaddingPercent = 50,
    toolSize = 1,
    rulerVisible = true,
    rulerLocked = false,
    rulerSize = DEFAULT_RULER_SCREEN_HEIGHT,
    rulerTextVisible = true,
    shapeType = "oval" as ShapeType,
    textLayers,
    activeTextLayerId,
    textSlotId = 0,
    textValue = DEFAULT_TEXT_VALUE,
    textSize = 34,
    textStyle = "plain",
    textInteractionMode = "edit",
    shapeInteractionMode = "move",
    shapeLayers,
    activeShapeLayerId = null,
    cells,
    onCellsChange,
    onTextLayerSelect,
    onTextLayerChange,
    onTextCanvasPointerDown,
    onShapeTypeChange,
    onShapeLayerChange,
    onShapeLayersChange,
    onShapeLayerSelect,
  }, ref) => {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const safeRulerSize = clamp(
      rulerSize,
      MIN_RULER_SCREEN_HEIGHT,
      MAX_RULER_SCREEN_HEIGHT,
    );

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
    const parentSyncRafRef = useRef<number | null>(null);
    const pendingParentCellsRef = useRef<string[] | null>(null);

    const [undoStack, setUndoStack] = useState<string[][]>([]);
    const [redoStack, setRedoStack] = useState<string[][]>([]);

    const strokeSnapshotRef = useRef<string[] | null>(null);
    const strokeHasChangesRef = useRef(false);

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const backgroundImageRef = useRef<HTMLImageElement | null>(null);
    const [backgroundImageVersion, setBackgroundImageVersion] = useState(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
      if (!backgroundImageUrl) {
        backgroundImageRef.current = null;
        setBackgroundImageVersion((version) => version + 1);
        return;
      }

      let cancelled = false;
      const image = new Image();

      image.onload = () => {
        if (cancelled) return;

        backgroundImageRef.current = image;
        setBackgroundImageVersion((version) => version + 1);
      };

      image.onerror = () => {
        if (cancelled) return;

        backgroundImageRef.current = null;
        setBackgroundImageVersion((version) => version + 1);
      };

      image.src = backgroundImageUrl;

      return () => {
        cancelled = true;
      };
    }, [backgroundImageUrl]);

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
    const lastPaintBoardPointRef = useRef<RulerPoint | null>(null);
    const rulerDrawActiveRef = useRef(false);
    const lastInputWasTouchRef = useRef(false);
    const rulerDragRef = useRef<{
      mode: RulerDragMode;
      startBoardPoint: RulerPoint | null;
      startRuler: RulerState | null;
    }>({
      mode: null,
      startBoardPoint: null,
      startRuler: null,
    });
    const shapeDragRef = useRef<{
      mode: ShapeDragMode;
      startBoardPoint: RulerPoint | null;
      startShape: ShapeState | null;
      textLayerId: number | null;
      startTextRotation: number;
      startShapeRotation: number;
    }>({
      mode: null,
      startBoardPoint: null,
      startShape: null,
      textLayerId: null,
      startTextRotation: 0,
      startShapeRotation: 0,
    });
    const pendingShapeDragRef = useRef<{
      mode: ShapeDragMode;
      startClientPoint: { x: number; y: number };
      startBoardPoint: RulerPoint;
      startShape: ShapeState;
      startShapeRotation: number;
    } | null>(null);
    const applyCurrentShapeRef = useRef<() => void>(() => {});
    const clearCurrentShapeRef = useRef<() => void>(() => {});
    const addCurrentShapeRef = useRef<(shapeType?: ShapeType) => void>(() => {});
    const shapeWasClearedRef = useRef(false);
    const textWasClearedRef = useRef(false);

    const [viewportSize, setViewportSize] = useState({
      width: 0,
      height: 0,
    });
    const [scale, setScale] = useState(1);
    const [previewCellIndex, setPreviewCellIndex] = useState<number | null>(null);
    const previewCellIndexRef = useRef<number | null>(null);
    const [ruler, setRuler] = useState<RulerState | null>(null);
    const [shapePreview, setShapePreview] = useState<ShapeState | null>(null);
    const [placedShapes, setPlacedShapes] = useState<ShapeItem[]>([]);
    const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
    const [activeShapeType, setActiveShapeType] = useState<ShapeType>(shapeType);
    const [activeShapeColor, setActiveShapeColor] = useState(activeColor);
    const shapePreviewRef = useRef<ShapeState | null>(null);
    const placedShapesRef = useRef<ShapeItem[]>([]);
    const activeShapeIdRef = useRef<string | null>(null);
    const activeShapeTypeRef = useRef<ShapeType>(shapeType);
    const activeShapeColorRef = useRef(activeColor);
    const hasSyncedShapeLayersFromPropsRef = useRef(!shapeLayers);
    const [textBoxes, setTextBoxes] = useState<Record<number, TextBoxState>>({});
    const rulerRef = useRef<RulerState | null>(null);

    const boardWidth = (maxRowLength - 1) * xStep + bead;
    const boardHeight = (rowCount - 1) * yStep + bead;
    const safeCanvasPaddingPercent = clamp(canvasPaddingPercent, 0, 50);
    const canvasPaddingRatio = safeCanvasPaddingPercent / 100;
    const canvasPaddingX = boardWidth * canvasPaddingRatio;
    const canvasPaddingY = boardHeight * canvasPaddingRatio;
    const canvasBoardWidth = boardWidth + canvasPaddingX * 2;
    const canvasBoardHeight = boardHeight + canvasPaddingY * 2;
    const safeToolSize = clamp(Math.round(toolSize), 1, 8);
    const fallbackTextLayerId = textSlotId || 1;
    const fallbackTextLayer: TextLayer = {
      id: fallbackTextLayerId,
      value: textValue.trim().length > 0 ? textValue.trim() : DEFAULT_TEXT_VALUE,
      color: activeColor,
      size: clamp(Math.round(textSize), MIN_TEXT_SIZE, MAX_TEXT_SIZE),
      style: textStyle as TextStyle,
      rotation: 0,
    };
    const hasRealTextLayers = Boolean(textLayers && textLayers.length > 0);
    const resolvedTextLayers = hasRealTextLayers ? textLayers ?? [] : [fallbackTextLayer];
    const visibleTextLayers = hasRealTextLayers ? resolvedTextLayers : [];
    const resolvedActiveTextLayerId = activeTextLayerId ?? fallbackTextLayerId;
    const activeTextLayer =
      resolvedTextLayers.find((layer) => layer.id === resolvedActiveTextLayerId) ?? resolvedTextLayers[0] ?? fallbackTextLayer;

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

    const createDefaultShape = useCallback((nextShapeType: ShapeType = shapeType): ShapeState => {
      const centerX = boardWidth / 2;
      const centerY = boardHeight / 2;
      const defaultWidth = Math.max(xStep * 3, Math.min(boardWidth * 0.42, xStep * 7));
      const defaultHeight = Math.max(yStep * 3, Math.min(boardHeight * 0.32, yStep * 7));
      const squareSide = Math.max(yStep * 4, Math.min(defaultWidth, defaultHeight));

      if (nextShapeType === "arrow" || nextShapeType === "doubleArrow") {
        return {
          start: { x: centerX - defaultWidth / 2, y: centerY },
          end: { x: centerX + defaultWidth / 2, y: centerY },
        };
      }

      if (nextShapeType === "circle" || nextShapeType === "square" || nextShapeType === "cross") {
        return {
          start: { x: centerX - squareSide / 2, y: centerY - squareSide / 2 },
          end: { x: centerX + squareSide / 2, y: centerY + squareSide / 2 },
        };
      }

      return {
        start: { x: centerX - defaultWidth / 2, y: centerY - defaultHeight / 2 },
        end: { x: centerX + defaultWidth / 2, y: centerY + defaultHeight / 2 },
      };
    }, [boardHeight, boardWidth, shapeType]);

    const createDefaultTextBox = useCallback(
      (layerIndex = 0, layerSize = activeTextLayer.size): TextBoxState => {
        const centerX = boardWidth / 2;
        const centerY = Math.max(yStep * 3, boardHeight * 0.24);
        const offsetX = layerIndex * xStep * 0.8;
        const offsetY = layerIndex * yStep * 0.8;
        const defaultWidth = Math.max(xStep * 5, Math.min(boardWidth * 0.62, xStep * 11));
        const defaultHeight = Math.max(yStep * 3.2, layerSize * 1.8);

        return {
          start: {
            x: centerX - defaultWidth / 2 + offsetX,
            y: centerY - defaultHeight / 2 + offsetY,
          },
          end: {
            x: centerX + defaultWidth / 2 + offsetX,
            y: centerY + defaultHeight / 2 + offsetY,
          },
        };
      },
      [activeTextLayer.size, boardHeight, boardWidth],
    );

    useEffect(() => {
      if (areArraysEqual(cellColorsRef.current, initialColors)) return;

      setCellColors(initialColors);
      cellColorsRef.current = initialColors;
      setUndoStack([]);
      setRedoStack([]);
      strokeSnapshotRef.current = null;
      strokeHasChangesRef.current = false;
      setPlacedShapes([]);
      setShapePreview(null);
      setActiveShapeId(null);
      setActiveShapeType(shapeType);
      setActiveShapeColor(activeColor);
      setTextBoxes({});
    }, [initialColors]);

    useEffect(() => {
      return () => {
        if (parentSyncRafRef.current !== null) {
          cancelAnimationFrame(parentSyncRafRef.current);
        }
      };
    }, []);

    useEffect(() => {
      rulerDragRef.current = {
        mode: null,
        startBoardPoint: null,
        startRuler: null,
      };

      if (tool === "ruler" && rulerVisible && !rulerRef.current) {
        syncRuler(createDefaultRuler());
      }
    }, [createDefaultRuler, rulerVisible, syncRuler, tool]);

    useEffect(() => {
      if (tool !== "shape") {
        shapeWasClearedRef.current = false;
      }
    }, [tool]);

    useEffect(() => {
      if (tool !== "shape") return;

      shapeWasClearedRef.current = false;
    }, [tool]);

    const getCurrentShapeLayers = useCallback(
      (
        nextPlacedShapes: ShapeItem[] = placedShapes,
        nextShapePreview: ShapeState | null = shapePreview,
        nextActiveShapeId: string | null = activeShapeId,
        nextShapeType: ShapeType = activeShapeType,
        nextShapeColor: string = activeShapeColor,
      ): ShapeLayer[] => {
        const layers: ShapeLayer[] = [...nextPlacedShapes];

        if (nextShapePreview) {
          layers.push({
            id: nextActiveShapeId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: nextShapeType,
            color: nextShapeColor,
            start: nextShapePreview.start,
            end: nextShapePreview.end,
            rotation: nextShapePreview.rotation || 0,
          });
        }

        return layers;
      },
      [activeShapeColor, activeShapeId, activeShapeType, placedShapes, shapePreview],
    );

    const getCurrentShapeLayersFromRefs = () => {
      const currentPlacedShapes = placedShapesRef.current;
      const currentShapePreview = shapePreviewRef.current;
      const currentActiveShapeId = activeShapeIdRef.current;
      const currentActiveShapeType = activeShapeTypeRef.current;
      const currentActiveShapeColor = activeShapeColorRef.current;
      const layers: ShapeLayer[] = [...currentPlacedShapes];

      if (currentShapePreview) {
        layers.push({
          id: currentActiveShapeId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: currentActiveShapeType,
          color: currentActiveShapeColor,
          start: currentShapePreview.start,
          end: currentShapePreview.end,
          rotation: currentShapePreview.rotation || 0,
        });
      }

      return layers;
    };


    const syncShapeLayersToParent = (
      layers: ShapeLayer[] = getCurrentShapeLayersFromRefs(),
      nextActiveShapeId: string | null = shapePreviewRef.current ? activeShapeIdRef.current : null,
    ) => {
      onShapeLayersChange?.(layers, nextActiveShapeId);
      onShapeLayerChange?.(layers.length > 0);
    };

    useEffect(() => {
      shapePreviewRef.current = shapePreview;
      placedShapesRef.current = placedShapes;
      activeShapeIdRef.current = activeShapeId;
      activeShapeTypeRef.current = activeShapeType;
      activeShapeColorRef.current = activeShapeColor;
    }, [activeShapeColor, activeShapeId, activeShapeType, placedShapes, shapePreview]);

    useEffect(() => {
      // Во время перетаскивания фигуры не синхронизируем локальное состояние
      // обратно из props. Иначе React успевает получить старый shapeLayers от родителя
      // и фигура визуально дергается между локальной позицией и сохраненной.
      if (shapeDragRef.current.mode) {
        return;
      }

      if (!shapeLayers) {
        hasSyncedShapeLayersFromPropsRef.current = true;
        return;
      }

      const activeLayer =
        shapeLayers.find((layer) => layer.id === activeShapeLayerId) ??
        shapeLayers[shapeLayers.length - 1] ??
        null;

      const nextPlacedShapes = activeLayer
        ? shapeLayers.filter((layer) => layer.id !== activeLayer.id)
        : [...shapeLayers];
      const nextPreview = activeLayer
        ? {
            start: activeLayer.start,
            end: activeLayer.end,
            rotation: activeLayer.rotation || 0,
          }
        : null;

      const currentSignature = JSON.stringify({
        placedShapes,
        shapePreview,
        activeShapeId,
        activeShapeType,
        activeShapeColor,
      });
      const nextSignature = JSON.stringify({
        placedShapes: nextPlacedShapes,
        shapePreview: nextPreview,
        activeShapeId: activeLayer?.id ?? null,
        activeShapeType: activeLayer?.type ?? shapeType,
        activeShapeColor: activeLayer?.color ?? activeColor,
      });

      if (currentSignature === nextSignature) {
        hasSyncedShapeLayersFromPropsRef.current = true;
        return;
      }

      placedShapesRef.current = nextPlacedShapes;
      shapePreviewRef.current = nextPreview;
      activeShapeIdRef.current = activeLayer?.id ?? null;
      activeShapeTypeRef.current = activeLayer?.type ?? shapeType;
      activeShapeColorRef.current = activeLayer?.color ?? activeColor;

      setPlacedShapes(nextPlacedShapes);
      setShapePreview(nextPreview);
      setActiveShapeId(activeLayer?.id ?? null);
      setActiveShapeType(activeLayer?.type ?? shapeType);
      setActiveShapeColor(activeLayer?.color ?? activeColor);

      if (activeLayer) {
        onShapeTypeChange?.(activeLayer.type);
      }

      hasSyncedShapeLayersFromPropsRef.current = true;
    }, [
      activeColor,
      activeShapeLayerId,
      onShapeTypeChange,
      shapeLayers,
      shapeType,
    ]);

    // Фигуры теперь синхронизируются с GridScreen только в момент действия:
    // добавить / выбрать / отпустить после движения / удалить.
    // Это повторяет подход текстового инструмента и убирает дергание тулбара.

    useEffect(() => {
      if (!hasRealTextLayers) {
        setTextBoxes({});
        return;
      }

      setTextBoxes((previousBoxes) => {
        const nextBoxes: Record<number, TextBoxState> = {};
        let hasChanged = false;

        visibleTextLayers.forEach((layer, index) => {
          const nextBox = previousBoxes[layer.id] ?? layer.box ?? createDefaultTextBox(index, layer.size);
          nextBoxes[layer.id] = nextBox;

          if (previousBoxes[layer.id] !== nextBox) {
            hasChanged = true;
          }
        });

        if (Object.keys(previousBoxes).length !== Object.keys(nextBoxes).length) {
          hasChanged = true;
        }

        return hasChanged ? nextBoxes : previousBoxes;
      });
    }, [createDefaultTextBox, hasRealTextLayers, visibleTextLayers]);

    useEffect(() => {
      if (rulerVisible) return;

      rulerDragRef.current = {
        mode: null,
        startBoardPoint: null,
        startRuler: null,
      };
      clearPreview();
    }, [rulerVisible]);

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
        canvasBoardWidth <= 0 ||
        canvasBoardHeight <= 0
      ) {
        return 1;
      }

      const availableWidth = Math.max(1, viewportSize.width - FIT_PADDING * 2);
      const availableHeight = Math.max(
        1,
        viewportSize.height - TOP_CONTROLS_RESERVED_HEIGHT - FIT_PADDING * 2,
      );

      const fitByWidth = availableWidth / canvasBoardWidth;
      const fitByHeight = availableHeight / canvasBoardHeight;

      return clamp(Math.min(fitByWidth, fitByHeight), MIN_ZOOM, MAX_ZOOM);
    }, [canvasBoardHeight, canvasBoardWidth, viewportSize.height, viewportSize.width]);

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

      const boardScreenX = centerX - boardCenterX * scale;
      const boardScreenY = centerY - boardCenterY * scale;
      const canvasScreenX = boardScreenX - canvasPaddingX * scale;
      const canvasScreenY = boardScreenY - canvasPaddingY * scale;
      const canvasScreenWidth = canvasBoardWidth * scale;
      const canvasScreenHeight = canvasBoardHeight * scale;
      const backgroundImage = backgroundImageRef.current;

      context.save();
      if (shouldDrawBackgroundColor(backgroundColor)) {
        context.fillStyle = backgroundColor;
        context.fillRect(canvasScreenX, canvasScreenY, canvasScreenWidth, canvasScreenHeight);
      }

      if (backgroundImage) {
        const imageRatio = backgroundImage.width / Math.max(1, backgroundImage.height);
        const canvasRatio = canvasScreenWidth / Math.max(1, canvasScreenHeight);
        const sourceWidth = imageRatio > canvasRatio ? backgroundImage.height * canvasRatio : backgroundImage.width;
        const sourceHeight = imageRatio > canvasRatio ? backgroundImage.height : backgroundImage.width / canvasRatio;
        const sourceX = (backgroundImage.width - sourceWidth) / 2;
        const sourceY = (backgroundImage.height - sourceHeight) / 2;

        context.globalAlpha = 0.92;
        context.drawImage(
          backgroundImage,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          canvasScreenX,
          canvasScreenY,
          canvasScreenWidth,
          canvasScreenHeight,
        );
      }

      if (safeCanvasPaddingPercent > 0) {
        context.strokeStyle = "rgba(255,255,255,0.12)";
        context.lineWidth = 1;
        context.setLineDash([10, 10]);
        context.strokeRect(canvasScreenX + 0.5, canvasScreenY + 0.5, canvasScreenWidth - 1, canvasScreenHeight - 1);
        context.setLineDash([]);
      }

      context.restore();

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

      if (rulerVisible && ruler) {
        rulerRef.current = ruler;

        const fixedRulerRect = getFixedScreenRectFromBoardRect(ruler.start, ruler.end);
        if (!fixedRulerRect) return;

        const startX = fixedRulerRect.startScreen.x;
        const startY = fixedRulerRect.startScreen.y;
        const endX = fixedRulerRect.endScreen.x;
        const endY = fixedRulerRect.endScreen.y;

        const dx = endX - startX;
        const dy = endY - startY;
        const screenLength = Math.max(1, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        const rulerBoardDx = ruler.end.x - ruler.start.x;
        const rulerBoardDy = ruler.end.y - ruler.start.y;
        const rulerBoardLength = Math.hypot(rulerBoardDx, rulerBoardDy);
        const rulerUnitX = rulerBoardLength > 0 ? rulerBoardDx / rulerBoardLength : 1;
        const rulerUnitY = rulerBoardLength > 0 ? rulerBoardDy / rulerBoardLength : 0;
        const normalX = rulerUnitY;
        const normalY = -rulerUnitX;
        const rulerCountRadius = Math.min(xStep, yStep) * 0.46;
        const rulerBeadCount =
          rulerBoardLength <= 0
            ? 0
            : beadPoints.reduce((count, point) => {
                const pointCenterX = point.x + bead / 2;
                const pointCenterY = point.y + bead / 2;
                const progress =
                  ((pointCenterX - ruler.start.x) * rulerUnitX +
                    (pointCenterY - ruler.start.y) * rulerUnitY) /
                  rulerBoardLength;

                if (progress < 0 || progress > 1) {
                  return count;
                }

                const closestX = ruler.start.x + rulerUnitX * rulerBoardLength * progress;
                const closestY = ruler.start.y + rulerUnitY * rulerBoardLength * progress;
                const distance = Math.hypot(pointCenterX - closestX, pointCenterY - closestY);

                return distance <= rulerCountRadius ? count + 1 : count;
              }, 0);

        const rulerHeight = Math.max(4, safeRulerSize * scale);
        const tickStep = clamp(xStep * scale, 18, 34);
        const tickCount = Math.max(1, Math.floor(screenLength / tickStep));
        const normalizedTickStep = screenLength / tickCount;
        const rulerAngleRaw = Math.atan2(rulerBoardDy, rulerBoardDx) * (180 / Math.PI);
        const rulerAngleNormalized = ((rulerAngleRaw % 180) + 180) % 180;
        const rulerAngle = Math.round(
          rulerAngleNormalized > 90 ? rulerAngleNormalized - 180 : rulerAngleNormalized,
        );
        const rulerCountLabel =
          rulerBeadCount === 1 ? "1 кружок" : String(rulerBeadCount) + " кружков";
        const label = `${rulerCountLabel} · ${rulerAngle}°`;
        const middleX = (startX + endX) / 2;
        const middleY = (startY + endY) / 2;

        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        context.translate(startX, startY);
        context.rotate(angle);

        context.shadowColor = "rgba(0,0,0,0.22)";
        context.shadowBlur = 10;
        context.shadowOffsetY = 4;
        context.beginPath();
        context.roundRect(0, -rulerHeight / 2, screenLength, rulerHeight, 12);
        context.fillStyle = "rgba(24,25,30,0.72)";
        context.fill();

        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        context.lineWidth = 1;
        context.strokeStyle = "rgba(255,255,255,0.18)";
        context.stroke();

        context.beginPath();
        context.moveTo(10, 0);
        context.lineTo(screenLength - 10, 0);
        context.lineWidth = 2.2;
        context.strokeStyle = "rgba(255,255,255,0.82)";
        context.stroke();

        for (let index = 0; index <= tickCount; index += 1) {
          const tickX = index * normalizedTickStep;
          const isMajorTick = index % 4 === 0;
          const tickLength = isMajorTick ? 13 : 8;

          context.beginPath();
          context.moveTo(tickX, -rulerHeight / 2 + 4);
          context.lineTo(tickX, -rulerHeight / 2 + 4 + tickLength);
          context.lineWidth = isMajorTick ? 1.5 : 1;
          context.strokeStyle = isMajorTick
            ? "rgba(255,255,255,0.92)"
            : "rgba(255,255,255,0.5)";
          context.stroke();
        }

        context.restore();

        for (const handle of [fixedRulerRect.startScreen, fixedRulerRect.endScreen]) {
          const handleX = handle.x;
          const handleY = handle.y;

          context.save();
          context.shadowColor = "rgba(0,0,0,0.26)";
          context.shadowBlur = 10;
          context.shadowOffsetY = 4;
          context.beginPath();
          context.arc(handleX, handleY, 11, 0, Math.PI * 2);
          context.fillStyle = rulerLocked ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.96)";
          context.fill();
          context.shadowBlur = 0;
          context.shadowOffsetY = 0;
          context.lineWidth = 2.5;
          context.strokeStyle = rulerLocked ? "rgba(255,255,255,0.45)" : "rgba(217,130,95,0.95)";
          context.stroke();
          context.beginPath();
          context.arc(handleX, handleY, 3.5, 0, Math.PI * 2);
          context.fillStyle = rulerLocked ? "rgba(80,80,88,0.9)" : "rgba(217,130,95,0.96)";
          context.fill();
          context.restore();
        }

        if (rulerTextVisible) {
          const labelX = middleX - normalX * 46;
          const labelY = middleY - normalY * 46;
          context.save();
          context.font = "800 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
          const labelWidth = context.measureText(label).width;
          const labelPaddingX = 10;
          const labelHeight = 28;
          const badgeX = labelX - labelWidth / 2 - labelPaddingX;
          const badgeY = labelY - labelHeight / 2;

          context.beginPath();
          context.roundRect(
            badgeX,
            badgeY,
            labelWidth + labelPaddingX * 2,
            labelHeight,
            14,
          );
          context.fillStyle = "rgba(24,25,30,0.82)";
          context.fill();
          context.lineWidth = 1;
          context.strokeStyle = "rgba(255,255,255,0.1)";
          context.stroke();

          context.fillStyle = "#ffffff";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(label, labelX, labelY + 0.5);
          context.restore();
        }
      }

      const drawShapeOverlay = (
        shape: ShapeState,
        currentShapeType: ShapeType,
        color: string,
        selected: boolean,
      ) => {
        const fixedRect = getFixedScreenRectFromBoardRect(shape.start, shape.end);

        if (!fixedRect) return;

        const {
          minX,
          maxX,
          minY,
          maxY,
          width: shapeWidth,
          height: shapeHeight,
          centerX: centerShapeX,
          centerY: centerShapeY,
          startScreen,
          endScreen,
        } = fixedRect;
        const squareSide = Math.max(1, Math.min(shapeWidth, shapeHeight));
        const squareX = centerShapeX - squareSide / 2;
        const squareY = centerShapeY - squareSide / 2;

        const drawArrowHead = (fromX: number, fromY: number, toX: number, toY: number) => {
          const angle = Math.atan2(toY - fromY, toX - fromX);
          const headLength = Math.min(28, Math.max(14, Math.hypot(toX - fromX, toY - fromY) * 0.18));
          const headAngle = Math.PI / 7;

          context.moveTo(toX, toY);
          context.lineTo(
            toX - Math.cos(angle - headAngle) * headLength,
            toY - Math.sin(angle - headAngle) * headLength,
          );
          context.moveTo(toX, toY);
          context.lineTo(
            toX - Math.cos(angle + headAngle) * headLength,
            toY - Math.sin(angle + headAngle) * headLength,
          );
        };

        context.save();
        context.translate(centerShapeX, centerShapeY);
        context.rotate(((shape.rotation || 0) * Math.PI) / 180);
        context.translate(-centerShapeX, -centerShapeY);
        context.lineWidth = Math.max(1, (selected ? 3 : 2.4) * scale);
        context.strokeStyle = color;
        context.fillStyle = "rgba(255,255,255,0.08)";
        context.shadowColor = "rgba(0,0,0,0.28)";
        context.shadowBlur = selected ? 12 : 8;
        context.shadowOffsetY = selected ? 5 : 3;
        context.lineCap = "round";
        context.lineJoin = "round";

        context.beginPath();

        if (currentShapeType === "oval") {
          context.ellipse(
            centerShapeX,
            centerShapeY,
            shapeWidth / 2,
            shapeHeight / 2,
            0,
            0,
            Math.PI * 2,
          );
          context.fill();
        } else if (currentShapeType === "circle") {
          context.ellipse(
            centerShapeX,
            centerShapeY,
            squareSide / 2,
            squareSide / 2,
            0,
            0,
            Math.PI * 2,
          );
          context.fill();
        } else if (currentShapeType === "square") {
          context.roundRect(squareX, squareY, squareSide, squareSide, 4);
          context.fill();
        } else if (currentShapeType === "triangle") {
          context.moveTo(centerShapeX, minY);
          context.lineTo(maxX, maxY);
          context.lineTo(minX, maxY);
          context.closePath();
          context.fill();
        } else if (currentShapeType === "cross") {
          context.moveTo(squareX, squareY);
          context.lineTo(squareX + squareSide, squareY + squareSide);
          context.moveTo(squareX + squareSide, squareY);
          context.lineTo(squareX, squareY + squareSide);
        } else if (currentShapeType === "arrow") {
          context.moveTo(startScreen.x, startScreen.y);
          context.lineTo(endScreen.x, endScreen.y);
          drawArrowHead(startScreen.x, startScreen.y, endScreen.x, endScreen.y);
        } else {
          context.moveTo(startScreen.x, startScreen.y);
          context.lineTo(endScreen.x, endScreen.y);
          drawArrowHead(startScreen.x, startScreen.y, endScreen.x, endScreen.y);
          drawArrowHead(endScreen.x, endScreen.y, startScreen.x, startScreen.y);
        }

        context.stroke();
        context.restore();

        if (!selected) return;

        const selectionPadding = 12;
        const selectionRadius = 12;

        context.save();
        context.beginPath();
        context.roundRect(
          minX - selectionPadding,
          minY - selectionPadding,
          shapeWidth + selectionPadding * 2,
          shapeHeight + selectionPadding * 2,
          selectionRadius,
        );
        context.fillStyle = "rgba(255,255,255,0.045)";
        context.fill();
        context.setLineDash([7, 6]);
        context.lineWidth = 1.25;
        context.strokeStyle = "rgba(255,255,255,0.56)";
        context.stroke();
        context.restore();

        if (shapeInteractionMode !== "size") return;

        for (const handle of [startScreen, endScreen]) {
          context.save();
          context.shadowColor = "rgba(0,0,0,0.32)";
          context.shadowBlur = 12;
          context.shadowOffsetY = 4;
          context.beginPath();
          context.arc(handle.x, handle.y, 13, 0, Math.PI * 2);
          context.fillStyle = "rgba(255,255,255,0.98)";
          context.fill();
          context.shadowBlur = 0;
          context.shadowOffsetY = 0;
          context.lineWidth = 3;
          context.strokeStyle = "rgba(184,93,106,0.96)";
          context.stroke();
          context.beginPath();
          context.arc(handle.x, handle.y, 4, 0, Math.PI * 2);
          context.fillStyle = "rgba(184,93,106,0.96)";
          context.fill();
          context.restore();
        }

        context.save();
        context.font = "800 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        const shapeLabel = "Фигура";
        const labelWidth = context.measureText(shapeLabel).width;
        const labelPaddingX = 10;
        const labelHeight = 28;
        context.beginPath();
        context.roundRect(
          centerShapeX - labelWidth / 2 - labelPaddingX,
          minY - 42,
          labelWidth + labelPaddingX * 2,
          labelHeight,
          14,
        );
        context.fillStyle = "rgba(22,23,28,0.82)";
        context.fill();
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(shapeLabel, centerShapeX, minY - 28);
        context.restore();
      };

      const drawTextOverlay = (box: TextBoxState, layer: TextLayer) => {
        const fixedRect = getFixedScreenRectFromBoardRect(box.start, box.end);

        if (!fixedRect) return;

        const { minX, minY, width, height } = fixedRect;
        const layerTextSize = clamp(Math.round(layer.size), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
        const layerTextValue = layer.value.trim();
        const lines = layerTextValue.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (lines.length === 0) return;

        const screenFontSize = Math.max(2, layerTextSize * scale);
        const lineHeight = screenFontSize * 1.18;
        const totalTextHeight = lineHeight * lines.length;
        const startTextY = -totalTextHeight / 2 + lineHeight / 2;
        const textX = 0;
        const centerTextX = minX + width / 2;
        const centerTextY = minY + height / 2;
        const rotationRadians = ((layer.rotation || 0) * Math.PI) / 180;

        context.save();
        context.translate(centerTextX, centerTextY);
        context.rotate(rotationRadians);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `900 ${screenFontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        context.lineJoin = "round";
        context.lineCap = "round";

        const isActiveTextLayer = tool === "text" && layer.id === activeTextLayer.id;

        if (isActiveTextLayer) {
          const measuredTextWidth = Math.max(
            screenFontSize * 0.7,
            ...lines.map((line) => context.measureText(line).width),
          );
          const selectionWidth = measuredTextWidth;
          const selectionHeight = totalTextHeight;
          const selectionPaddingX = 8;
          const selectionPaddingY = 6;
          const selectionRadius = 10;

          context.save();
          context.beginPath();
          context.roundRect(
            -selectionWidth / 2 - selectionPaddingX,
            -selectionHeight / 2 - selectionPaddingY,
            selectionWidth + selectionPaddingX * 2,
            selectionHeight + selectionPaddingY * 2,
            selectionRadius,
          );
          context.fillStyle = "rgba(255,255,255,0.045)";
          context.fill();
          context.setLineDash([7, 6]);
          context.lineWidth = 1.25;
          context.strokeStyle = "rgba(255,255,255,0.52)";
          context.stroke();
          context.restore();
        }

        context.fillStyle = layer.color;

        if (layer.style === "shadow") {
          context.shadowColor = "rgba(0,0,0,0.42)";
          context.shadowBlur = 10;
          context.shadowOffsetY = 4;
        }

        lines.forEach((line, index) => {
          context.fillText(line, textX, startTextY + index * lineHeight);
        });
        context.shadowBlur = 0;

        context.restore();
      };

      placedShapes.forEach((shape) => {
        drawShapeOverlay(shape, shape.type, shape.color, false);
      });

      if (shapePreview && tool === "shape") {
        drawShapeOverlay(shapePreview, activeShapeType, activeShapeColor, true);
      }

      visibleTextLayers.forEach((layer, index) => {
        const box = textBoxes[layer.id] ?? layer.box ?? createDefaultTextBox(index, layer.size);

        drawTextOverlay(box, layer);
      });

      if (
        previewCellIndex !== null &&
        previewCellIndex >= 0 &&
        previewCellIndex < beadPoints.length &&
        (tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate")
      ) {
        const point = beadPoints[previewCellIndex];
        const screenX = centerX + (point.x - boardCenterX) * scale;
        const screenY = centerY + (point.y - boardCenterY) * scale;
        const beadRadius = bead * scale * 0.5;
        const toolRadius =
          safeToolSize <= 1
            ? beadRadius
            : (Math.max(xStep, yStep) * (safeToolSize - 1) * 0.78 + bead * 0.5) * scale;
        const centerPreviewX = screenX + beadRadius;
        const centerPreviewY = screenY + beadRadius;

        context.save();

        context.beginPath();
        context.arc(centerPreviewX, centerPreviewY, toolRadius, 0, Math.PI * 2);
        context.fillStyle =
          tool === "erase"
            ? "rgba(255,255,255,0.08)"
            : tool === "deactivate"
              ? "rgba(255,255,255,0.05)"
              : "rgba(217,130,95,0.12)";
        context.fill();

        context.beginPath();
        context.arc(centerPreviewX, centerPreviewY, toolRadius, 0, Math.PI * 2);
        context.lineWidth = Math.max(2, scale * 1.5);
        context.setLineDash(tool === "deactivate" ? [8, 6] : []);
        context.strokeStyle =
          tool === "erase"
            ? "rgba(255,255,255,0.96)"
            : tool === "deactivate"
              ? "rgba(255,255,255,0.74)"
              : "rgba(217,130,95,0.96)";
        context.stroke();

        context.restore();
      }
    }, [
      activeColor,
      backgroundColor,
      backgroundImageVersion,
      beadPoints,
      boardHeight,
      boardWidth,
      canvasBoardHeight,
      canvasBoardWidth,
      canvasPaddingX,
      canvasPaddingY,
      safeCanvasPaddingPercent,
      previewCellIndex,
      ruler,
      rulerVisible,
      rulerTextVisible,
      safeRulerSize,
      safeToolSize,
      scale,
      placedShapes,
      resolvedTextLayers,
      activeTextLayer,
      shapePreview,
      shapeType,
      activeShapeType,
      shapeInteractionMode,
      activeShapeColor,
      textBoxes,
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

    const syncParentCells = useCallback(
      (next: string[]) => {
        pendingParentCellsRef.current = next;

        if (parentSyncRafRef.current !== null) {
          return;
        }

        parentSyncRafRef.current = requestAnimationFrame(() => {
          parentSyncRafRef.current = null;

          const pendingCells = pendingParentCellsRef.current;
          pendingParentCellsRef.current = null;

          if (!pendingCells) return;
          onCellsChange?.(pendingCells);
        });
      },
      [onCellsChange],
    );

    const flushParentCells = useCallback(() => {
      const pendingCells = pendingParentCellsRef.current ?? cellColorsRef.current;
      pendingParentCellsRef.current = null;

      if (parentSyncRafRef.current !== null) {
        cancelAnimationFrame(parentSyncRafRef.current);
        parentSyncRafRef.current = null;
      }

      onCellsChange?.(pendingCells);
    }, [onCellsChange]);

    const applyCellColors = useCallback(
      (next: string[], syncParent = true) => {
        cellColorsRef.current = next;
        setCellColors(next);

        if (syncParent) {
          syncParentCells(next);
        }
      },
      [syncParentCells],
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
      const beadCountMap = new Map<string, number>();
      let totalVisibleBeads = 0;

      beadPoints.forEach((point) => {
        if (isInactiveColor(point.color)) return;

        const nextCount = (beadCountMap.get(point.color) ?? 0) + 1;
        beadCountMap.set(point.color, nextCount);
        totalVisibleBeads += 1;
      });

      const beadCountItems = Array.from(beadCountMap.entries())
        .map(([color, count]) => ({ color, count }))
        .sort((first, second) => second.count - first.count || first.color.localeCompare(second.color));
      const visiblePanelRows = Math.ceil(
        Math.min(beadCountItems.length, EXPORT_INFO_MAX_COLOR_ROWS) /
          (boardWidth + EXPORT_PADDING * 2 >= 760 ? 2 : 1),
      );
      const infoPanelHeight = getExportInfoPanelHeight(visiblePanelRows);
      const logicalWidth = Math.max(canvasBoardWidth + EXPORT_PADDING * 2, EXPORT_INFO_MIN_WIDTH);
      const canvasAreaX = (logicalWidth - canvasBoardWidth) / 2;
      const canvasAreaY = EXPORT_PADDING;
      const boardX = canvasAreaX + canvasPaddingX;
      const boardY = canvasAreaY + canvasPaddingY;
      const infoPanelX = EXPORT_PADDING;
      const infoPanelY = canvasAreaY + canvasBoardHeight + EXPORT_INFO_GAP;
      const infoPanelWidth = logicalWidth - EXPORT_PADDING * 2;
      const logicalHeight = infoPanelY + infoPanelHeight + EXPORT_PADDING;
      const maxLogicalSide = Math.max(logicalWidth, logicalHeight);
      const exportScale = Math.min(
        EXPORT_DPR,
        MAX_EXPORT_IMAGE_SIDE / Math.max(1, maxLogicalSide),
      );
      const safeExportScale = Math.max(0.5, exportScale);

      canvas.width = Math.max(1, Math.round(logicalWidth * safeExportScale));
      canvas.height = Math.max(1, Math.round(logicalHeight * safeExportScale));

      const context = canvas.getContext("2d");
      if (!context) return null;

      context.scale(safeExportScale, safeExportScale);
      context.clearRect(0, 0, logicalWidth, logicalHeight);

      if (shouldDrawBackgroundColor(backgroundColor)) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, logicalWidth, logicalHeight);
      }

      const backgroundImage = backgroundImageRef.current;
      if (backgroundImage) {
        context.globalAlpha = 0.92;
        drawCoverImage(context, backgroundImage, canvasAreaX, canvasAreaY, canvasBoardWidth, canvasBoardHeight);
        context.globalAlpha = 1;
      }

      context.save();
      drawRoundedRect(
        context,
        boardX - 16,
        boardY - 16,
        boardWidth + 32,
        boardHeight + 32,
        26,
      );
      context.fillStyle = "rgba(255,255,255,0.18)";
      context.fill();
      context.restore();

      for (let index = 0; index < beadPoints.length; index += 1) {
        const point = beadPoints[index];

        if (isInactiveColor(point.color)) {
          continue;
        }

        const radius = bead / 2;
        const x = boardX + point.x + radius;
        const y = boardY + point.y + radius;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);

        context.fillStyle = point.color === baseColor ? "#f4f5f7" : point.color;
        context.fill();

        context.lineWidth = 1;
        context.strokeStyle =
          point.color === baseColor ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.18)";
        context.stroke();
      }

      const drawExportShapeLayer = (shape: ShapeLayer) => {
        const minX = Math.min(shape.start.x, shape.end.x);
        const maxX = Math.max(shape.start.x, shape.end.x);
        const minY = Math.min(shape.start.y, shape.end.y);
        const maxY = Math.max(shape.start.y, shape.end.y);
        const shapeWidth = Math.max(1, maxX - minX);
        const shapeHeight = Math.max(1, maxY - minY);
        const centerShapeX = boardX + minX + shapeWidth / 2;
        const centerShapeY = boardY + minY + shapeHeight / 2;
        const squareSide = Math.max(1, Math.min(shapeWidth, shapeHeight));
        const squareX = centerShapeX - squareSide / 2;
        const squareY = centerShapeY - squareSide / 2;
        const startX = boardX + shape.start.x;
        const startY = boardY + shape.start.y;
        const endX = boardX + shape.end.x;
        const endY = boardY + shape.end.y;
        const strokeWidth = Math.max(2.5, bead * 0.16);

        const drawArrowHead = (fromX: number, fromY: number, toX: number, toY: number) => {
          const angle = Math.atan2(toY - fromY, toX - fromX);
          const headLength = Math.min(bead * 2.4, Math.max(bead * 1.1, Math.hypot(toX - fromX, toY - fromY) * 0.2));
          const headAngle = Math.PI / 7;

          context.moveTo(toX, toY);
          context.lineTo(
            toX - Math.cos(angle - headAngle) * headLength,
            toY - Math.sin(angle - headAngle) * headLength,
          );
          context.moveTo(toX, toY);
          context.lineTo(
            toX - Math.cos(angle + headAngle) * headLength,
            toY - Math.sin(angle + headAngle) * headLength,
          );
        };

        context.save();
        context.translate(centerShapeX, centerShapeY);
        context.rotate(((shape.rotation || 0) * Math.PI) / 180);
        context.translate(-centerShapeX, -centerShapeY);
        context.strokeStyle = shape.color;
        context.fillStyle = "rgba(255,255,255,0.08)";
        context.lineWidth = strokeWidth;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();

        if (shape.type === "oval") {
          context.ellipse(centerShapeX, centerShapeY, shapeWidth / 2, shapeHeight / 2, 0, 0, Math.PI * 2);
          context.fill();
        } else if (shape.type === "circle") {
          context.ellipse(centerShapeX, centerShapeY, squareSide / 2, squareSide / 2, 0, 0, Math.PI * 2);
          context.fill();
        } else if (shape.type === "square") {
          context.roundRect(squareX, squareY, squareSide, squareSide, bead * 0.18);
          context.fill();
        } else if (shape.type === "triangle") {
          context.moveTo(centerShapeX, boardY + minY);
          context.lineTo(boardX + maxX, boardY + maxY);
          context.lineTo(boardX + minX, boardY + maxY);
          context.closePath();
          context.fill();
        } else if (shape.type === "cross") {
          context.moveTo(squareX, squareY);
          context.lineTo(squareX + squareSide, squareY + squareSide);
          context.moveTo(squareX + squareSide, squareY);
          context.lineTo(squareX, squareY + squareSide);
        } else if (shape.type === "arrow") {
          context.moveTo(startX, startY);
          context.lineTo(endX, endY);
          drawArrowHead(startX, startY, endX, endY);
        } else {
          context.moveTo(startX, startY);
          context.lineTo(endX, endY);
          drawArrowHead(startX, startY, endX, endY);
          drawArrowHead(endX, endY, startX, startY);
        }

        context.stroke();
        context.restore();
      };

      getCurrentShapeLayers().forEach(drawExportShapeLayer);

      visibleTextLayers.forEach((layer, index) => {
        const box = textBoxes[layer.id] ?? createDefaultTextBox(index, layer.size);
        const layerTextSize = clamp(Math.round(layer.size), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
        const layerTextValue = layer.value.trim();
        const lines = layerTextValue.split(/\r?\n/).filter((line) => line.trim().length > 0);

        if (lines.length === 0) return;

        const minX = Math.min(box.start.x, box.end.x);
        const maxX = Math.max(box.start.x, box.end.x);
        const minY = Math.min(box.start.y, box.end.y);
        const maxY = Math.max(box.start.y, box.end.y);
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const lineHeight = layerTextSize * 1.18;
        const totalTextHeight = lineHeight * lines.length;
        const startTextY = -totalTextHeight / 2 + lineHeight / 2;
        const centerTextX = boardX + minX + width / 2;
        const centerTextY = boardY + minY + height / 2;
        const rotationRadians = ((layer.rotation || 0) * Math.PI) / 180;

        context.save();
        context.translate(centerTextX, centerTextY);
        context.rotate(rotationRadians);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `900 ${layerTextSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.fillStyle = layer.color;

        if (layer.style === "shadow") {
          context.shadowColor = "rgba(0,0,0,0.42)";
          context.shadowBlur = 10;
          context.shadowOffsetY = 4;
        }

        lines.forEach((line, lineIndex) => {
          context.fillText(line, 0, startTextY + lineIndex * lineHeight);
        });

        context.restore();
      });

      drawBeadCountPanel(
        context,
        beadCountItems,
        totalVisibleBeads,
        infoPanelX,
        infoPanelY,
        infoPanelWidth,
        infoPanelHeight,
      );

      return canvas;
    }, [
      backgroundColor,
      backgroundImageVersion,
      beadPoints,
      boardHeight,
      boardWidth,
      canvasBoardHeight,
      canvasBoardWidth,
      canvasPaddingX,
      canvasPaddingY,
      createDefaultTextBox,
      getCurrentShapeLayers,
      textBoxes,
      visibleTextLayers,
    ]);

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
        applyCurrentShape: () => applyCurrentShapeRef.current(),
        clearCurrentShape: () => clearCurrentShapeRef.current(),
        addCurrentShape: (nextShapeType?: ShapeType) => addCurrentShapeRef.current(nextShapeType),
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
      placedShapes,
      shapePreview,
      textBoxes,
      resolvedTextLayers,
      activeTextLayer,
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

    const getBoardPointFromLocalPoint = (localX: number, localY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;

      const rect = viewport.getBoundingClientRect();
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

    const getFixedScreenRectFromBoardRect = (start: RulerPoint, end: RulerPoint) => {
      const centerBoard = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };
      const centerScreen = getScreenPointFromBoardPoint(centerBoard);

      if (!centerScreen) return null;

      // Позиция и размер следуют за текущим зумом сетки.
      // Когда сетка уменьшается — объект уменьшается вместе с ней, когда увеличивается — увеличивается.
      const fixedDx = (end.x - start.x) * scale;
      const fixedDy = (end.y - start.y) * scale;
      const startScreen = {
        x: centerScreen.x - fixedDx / 2,
        y: centerScreen.y - fixedDy / 2,
      };
      const endScreen = {
        x: centerScreen.x + fixedDx / 2,
        y: centerScreen.y + fixedDy / 2,
      };
      const minX = Math.min(startScreen.x, endScreen.x);
      const maxX = Math.max(startScreen.x, endScreen.x);
      const minY = Math.min(startScreen.y, endScreen.y);
      const maxY = Math.max(startScreen.y, endScreen.y);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);

      return {
        minX,
        maxX,
        minY,
        maxY,
        width,
        height,
        centerX: centerScreen.x,
        centerY: centerScreen.y,
        startScreen,
        endScreen,
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

    const getProjectionOnSegment = (
      point: RulerPoint,
      segmentStart: RulerPoint,
      segmentEnd: RulerPoint,
    ) => {
      const dx = segmentEnd.x - segmentStart.x;
      const dy = segmentEnd.y - segmentStart.y;
      const length = Math.hypot(dx, dy);
      const lengthSquared = dx * dx + dy * dy;

      if (lengthSquared <= 0) {
        return {
          point: segmentStart,
          distance: Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y),
          progress: 0,
          length,
        };
      }

      const progress = clamp(
        ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
          lengthSquared,
        0,
        1,
      );
      const projectedPoint = {
        x: segmentStart.x + dx * progress,
        y: segmentStart.y + dy * progress,
      };

      return {
        point: projectedPoint,
        distance: Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y),
        progress,
        length,
      };
    };

    const getRulerTopGuideScreenSegment = (currentRuler: RulerState) => {
      const fixedRect = getFixedScreenRectFromBoardRect(currentRuler.start, currentRuler.end);
      if (!fixedRect) return null;

      const startPoint = fixedRect.startScreen;
      const endPoint = fixedRect.endScreen;

      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const length = Math.hypot(dx, dy);

      if (length <= 0) return null;

      const unitX = dx / length;
      const unitY = dy / length;
      const normalX = unitY;
      const normalY = -unitX;
      // Линейка отрисовывается в экранных координатах с высотой safeRulerSize * scale.
      // Направляющая для кисти должна брать такой же экранный отступ, иначе при зуме
      // появляется сдвиг между кистью и краем линейки.
      const rulerScreenHeight = Math.max(4, safeRulerSize * scale);
      const topOffset = rulerScreenHeight / 2 + RULER_EDGE_DRAW_GAP;

      return {
        start: {
          x: startPoint.x + normalX * topOffset,
          y: startPoint.y + normalY * topOffset,
        },
        end: {
          x: endPoint.x + normalX * topOffset,
          y: endPoint.y + normalY * topOffset,
        },
      };
    };


    const getRulerTopGuideBoardSegment = (currentRuler: RulerState) => {
      const screenSegment = getRulerTopGuideScreenSegment(currentRuler);
      if (!screenSegment) return null;

      const startBoardPoint = getBoardPointFromLocalPoint(
        screenSegment.start.x,
        screenSegment.start.y,
      );
      const endBoardPoint = getBoardPointFromLocalPoint(
        screenSegment.end.x,
        screenSegment.end.y,
      );

      if (!startBoardPoint || !endBoardPoint) return null;

      const dx = endBoardPoint.x - startBoardPoint.x;
      const dy = endBoardPoint.y - startBoardPoint.y;
      const length = Math.hypot(dx, dy);

      if (length <= 0) return null;

      const unitX = dx / length;
      const unitY = dy / length;
      const normalX = unitY;
      const normalY = -unitX;

      return {
        start: startBoardPoint,
        end: endBoardPoint,
        unitX,
        unitY,
        normalX,
        normalY,
        length,
      };
    };


    const getRulerGuideHitDistance = (isActiveStroke: boolean) => {
      const isTouchInput = lastInputWasTouchRef.current;

      if (isActiveStroke) {
        return isTouchInput
          ? RULER_GUIDE_ACTIVE_HIT_DISTANCE_TOUCH
          : RULER_GUIDE_ACTIVE_HIT_DISTANCE_DESKTOP;
      }

      return isTouchInput
        ? RULER_GUIDE_START_HIT_DISTANCE_TOUCH
        : RULER_GUIDE_START_HIT_DISTANCE_DESKTOP;
    };

    const getRulerGuidedBoardPoint = (
      clientX: number,
      clientY: number,
      isActiveStroke: boolean,
    ) => {
      const currentRuler = rulerVisible ? rulerRef.current : null;
      if (!currentRuler || !isPaintTool()) return null;

      const localPoint = getLocalPointFromClient(clientX, clientY);
      if (!localPoint) return null;

      const guideSegment = getRulerTopGuideScreenSegment(currentRuler);
      if (!guideSegment) return null;

      const projection = getProjectionOnSegment(
        { x: localPoint.x, y: localPoint.y },
        guideSegment.start,
        guideSegment.end,
      );
      const hitDistance = getRulerGuideHitDistance(isActiveStroke);

      if (projection.distance > hitDistance) return null;

      return getBoardPointFromLocalPoint(projection.point.x, projection.point.y);
    };

    const getRulerHitAtClientPoint = (
      clientX: number,
      clientY: number,
    ): RulerDragMode => {
      const currentRuler = rulerVisible ? rulerRef.current : null;
      if (!currentRuler) return null;

      const localPoint = getLocalPointFromClient(clientX, clientY);
      const fixedRect = getFixedScreenRectFromBoardRect(currentRuler.start, currentRuler.end);

      if (!localPoint || !fixedRect) return null;

      const startPoint = fixedRect.startScreen;
      const endPoint = fixedRect.endScreen;

      const pointer = {
        x: localPoint.x,
        y: localPoint.y,
      };
      const handleHitRadius = lastInputWasTouchRef.current ? 26 : 32;
      const bodyHitRadius = lastInputWasTouchRef.current ? 18 : 24;

      if (Math.hypot(pointer.x - startPoint.x, pointer.y - startPoint.y) <= handleHitRadius) {
        return "start";
      }

      if (Math.hypot(pointer.x - endPoint.x, pointer.y - endPoint.y) <= handleHitRadius) {
        return "end";
      }

      if (getDistanceToSegment(pointer, startPoint, endPoint) <= bodyHitRadius) {
        return "body";
      }

      return null;
    };

    const isPaintTool = () => {
      return tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate";
    };

    const getShapeHitAtClientPoint = (
      clientX: number,
      clientY: number,
      currentShape: ShapeState,
      currentShapeType: ShapeType = shapeType,
      allowHandles = false,
    ): ShapeDragMode => {
      const localPoint = getLocalPointFromClient(clientX, clientY);
      const fixedRect = getFixedScreenRectFromBoardRect(currentShape.start, currentShape.end);

      if (!localPoint || !fixedRect) return null;

      const {
        minX,
        maxX,
        minY,
        maxY,
        width: shapeWidth,
        height: shapeHeight,
        centerX,
        centerY,
        startScreen: startPoint,
        endScreen: endPoint,
      } = fixedRect;
      const rotationRadians = -((currentShape.rotation || 0) * Math.PI) / 180;
      const rawPointer = { x: localPoint.x, y: localPoint.y };
      const rawDx = rawPointer.x - centerX;
      const rawDy = rawPointer.y - centerY;
      const pointer = {
        x: centerX + rawDx * Math.cos(rotationRadians) - rawDy * Math.sin(rotationRadians),
        y: centerY + rawDx * Math.sin(rotationRadians) + rawDy * Math.cos(rotationRadians),
      };
      const hitPadding = lastInputWasTouchRef.current ? 18 : 10;
      const handleHitRadius = lastInputWasTouchRef.current ? 34 : 28;

      if (allowHandles) {
        if (Math.hypot(pointer.x - startPoint.x, pointer.y - startPoint.y) <= handleHitRadius) {
          return "start";
        }

        if (Math.hypot(pointer.x - endPoint.x, pointer.y - endPoint.y) <= handleHitRadius) {
          return "end";
        }
      }
      const squareSide = Math.max(1, Math.min(shapeWidth, shapeHeight));
      const squareMinX = centerX - squareSide / 2;
      const squareMaxX = centerX + squareSide / 2;
      const squareMinY = centerY - squareSide / 2;
      const squareMaxY = centerY + squareSide / 2;
      const edgePadding = lastInputWasTouchRef.current ? 30 : 22;

      if (currentShapeType === "arrow" || currentShapeType === "doubleArrow") {
        const projection = getProjectionOnSegment(pointer, startPoint, endPoint);
        return projection.distance <= edgePadding ? "body" : null;
      }

      if (currentShapeType === "cross") {
        const firstDistance = getDistanceToSegment(
          pointer,
          { x: squareMinX, y: squareMinY },
          { x: squareMaxX, y: squareMaxY },
        );
        const secondDistance = getDistanceToSegment(
          pointer,
          { x: squareMaxX, y: squareMinY },
          { x: squareMinX, y: squareMaxY },
        );

        return Math.min(firstDistance, secondDistance) <= edgePadding ? "body" : null;
      }

      const isInsideBox =
        pointer.x >= minX - edgePadding &&
        pointer.x <= maxX + edgePadding &&
        pointer.y >= minY - edgePadding &&
        pointer.y <= maxY + edgePadding;

      if (!isInsideBox) return null;

      if (currentShapeType === "square" || currentShapeType === "triangle") {
        return "body";
      }

      const radiusX =
        currentShapeType === "circle"
          ? squareSide / 2
          : Math.max(1, Math.abs(endPoint.x - startPoint.x) / 2);
      const radiusY =
        currentShapeType === "circle"
          ? squareSide / 2
          : Math.max(1, Math.abs(endPoint.y - startPoint.y) / 2);

      const normalizedDistance = Math.sqrt(
        ((pointer.x - centerX) / Math.max(1, radiusX)) ** 2 +
          ((pointer.y - centerY) / Math.max(1, radiusY)) ** 2,
      );

      // Круг и овал визуально воспринимаются как цельная фигура, поэтому
      // нажимать можно не только в контур, а во всю внутреннюю область.
      // Допуск нужен для пальца на телефоне, чтобы не было ощущения, что
      // по фигуре сложно попасть.
      const normalizedHitPadding = Math.max(
        hitPadding / Math.max(1, radiusX),
        hitPadding / Math.max(1, radiusY),
      );

      return normalizedDistance <= 1 + normalizedHitPadding ? "body" : null;
    };

    const getTextHitAtClientPoint = (
      clientX: number,
      clientY: number,
      currentTextBox: TextBoxState,
      layer: TextLayer,
    ): boolean => {
      const localPoint = getLocalPointFromClient(clientX, clientY);
      const fixedRect = getFixedScreenRectFromBoardRect(currentTextBox.start, currentTextBox.end);

      if (!localPoint || !fixedRect) return false;

      const { width, height, centerX: centerTextX, centerY: centerTextY } = fixedRect;
      const rotationRadians = -((layer.rotation || 0) * Math.PI) / 180;
      const dx = localPoint.x - centerTextX;
      const dy = localPoint.y - centerTextY;
      const rotatedPoint = {
        x: centerTextX + dx * Math.cos(rotationRadians) - dy * Math.sin(rotationRadians),
        y: centerTextY + dx * Math.sin(rotationRadians) + dy * Math.cos(rotationRadians),
      };
      const layerTextSize = clamp(Math.round(layer.size), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
      const layerTextValue = layer.value.trim();
      const lines = layerTextValue.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length === 0) return false;

      const screenFontSize = Math.max(2, layerTextSize * scale);
      const lineHeight = screenFontSize * 1.18;
      const totalTextHeight = lineHeight * lines.length;
      const hitPadding = lastInputWasTouchRef.current ? 18 : 10;

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const measuredWidth = context
        ? (() => {
            context.save();
            context.font = `900 ${screenFontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
            const measured = Math.max(screenFontSize * 0.7, ...lines.map((line) => context.measureText(line).width));
            context.restore();
            return measured;
          })()
        : Math.max(...lines.map((line) => line.length * screenFontSize * 0.62));

      const textHitWidth = Math.min(width, measuredWidth + 12);
      const textHitHeight = Math.min(height, totalTextHeight + 8);

      return (
        rotatedPoint.x >= centerTextX - textHitWidth / 2 - hitPadding &&
        rotatedPoint.x <= centerTextX + textHitWidth / 2 + hitPadding &&
        rotatedPoint.y >= centerTextY - textHitHeight / 2 - hitPadding &&
        rotatedPoint.y <= centerTextY + textHitHeight / 2 + hitPadding
      );
    };

    const startShapeDrag = (
      boardPoint: RulerPoint,
      mode: ShapeDragMode,
      currentShape: ShapeState,
      textLayerId: number | null = null,
      startTextRotation = 0,
      startShapeRotation = 0,
    ) => {
      if (!mode) return false;

      shapeDragRef.current = {
        mode,
        startBoardPoint: boardPoint,
        startShape: currentShape,
        textLayerId,
        startTextRotation,
        startShapeRotation,
      };

      dragging.current = false;
      painting.current = false;
      clearPreview();
      return true;
    };

    const getPaintCellIndicesAroundCell = (cellIndex: number) => {
      const centerPoint = beadPoints[cellIndex];
      if (!centerPoint) return [];

      if (safeToolSize <= 1) {
        return [cellIndex];
      }

      const centerX = centerPoint.x + bead / 2;
      const centerY = centerPoint.y + bead / 2;
      const paintRadius = Math.max(xStep, yStep) * (safeToolSize - 1) * 0.78;
      const radiusSquared = paintRadius * paintRadius;
      const indices: number[] = [];

      for (let index = 0; index < beadPoints.length; index += 1) {
        const point = beadPoints[index];
        const pointCenterX = point.x + bead / 2;
        const pointCenterY = point.y + bead / 2;
        const dx = pointCenterX - centerX;
        const dy = pointCenterY - centerY;

        if (dx * dx + dy * dy <= radiusSquared) {
          indices.push(index);
        }
      }

      return indices;
    };

    const getNextColorForTool = (currentColor: string) => {
      const isInactive = isInactiveColor(currentColor);

      if (tool === "deactivate") {
        return inactiveCellColor;
      }

      if (tool === "add") {
        return isInactive ? baseColor : currentColor;
      }

      if (tool === "brush") {
        return isInactive ? null : activeColor;
      }

      if (tool === "erase") {
        return isInactive ? null : baseColor;
      }

      return null;
    };

    const applyPaintToCellIndices = (cellIndices: number[]) => {
      if (!isPaintTool() || cellIndices.length === 0) return false;

      const currentColors = cellColorsRef.current;
      const next = [...currentColors];
      const uniqueIndices = new Set(cellIndices);
      let hasChanges = false;

      uniqueIndices.forEach((index) => {
        const currentColor = currentColors[index] ?? baseColor;
        const nextColor = getNextColorForTool(currentColor);

        if (nextColor === null || currentColor === nextColor) {
          return;
        }

        next[index] = nextColor;
        hasChanges = true;
      });

      if (!hasChanges) {
        return false;
      }

      if (!strokeHasChangesRef.current) {
        strokeHasChangesRef.current = true;
        pushUndoSnapshot(strokeSnapshotRef.current ?? currentColors);
      }

      applyCellColors(next);
      return true;
    };

    const applyPaintAtBoardPoint = (boardPoint: RulerPoint) => {
      const cellIndex = getCellIndexAtBoardPoint(boardPoint.x, boardPoint.y);
      if (cellIndex === null) return false;

      return applyPaintToCellIndices(getPaintCellIndicesAroundCell(cellIndex));
    };

    const applyPaintLineBetweenBoardPoints = (fromPoint: RulerPoint, toPoint: RulerPoint) => {
      const dx = toPoint.x - fromPoint.x;
      const dy = toPoint.y - fromPoint.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.max(3, Math.min(xStep, yStep) * 0.32);
      const steps = Math.max(1, Math.ceil(distance / step));

      for (let index = 1; index <= steps; index += 1) {
        const progress = index / steps;
        applyPaintAtBoardPoint({
          x: fromPoint.x + dx * progress,
          y: fromPoint.y + dy * progress,
        });
      }
    };


    const applyPaintRulerLineBetweenBoardPoints = (
      fromPoint: RulerPoint,
      toPoint: RulerPoint,
    ) => {
      const currentRuler = rulerVisible ? rulerRef.current : null;
      if (!currentRuler) return false;

      const guide = getRulerTopGuideBoardSegment(currentRuler);
      if (!guide) return false;

      const lineDx = toPoint.x - fromPoint.x;
      const lineDy = toPoint.y - fromPoint.y;
      const strokeLength = Math.hypot(lineDx, lineDy);
      const minStep = Math.min(xStep, yStep);
      const centerTolerance = minStep * 0.48;
      const topExpansion = safeToolSize <= 1 ? 0 : (safeToolSize - 1) * minStep * 0.72;
      const lowerDistance = -centerTolerance;
      const upperDistance = centerTolerance + topExpansion;
      const progressPadding = minStep * 0.58;
      const indices: number[] = [];

      const getProgress = (point: RulerPoint) =>
        (point.x - guide.start.x) * guide.unitX + (point.y - guide.start.y) * guide.unitY;

      const fromProgress = getProgress(fromPoint);
      const toProgress = getProgress(toPoint);
      const minProgress = Math.min(fromProgress, toProgress) - progressPadding;
      const maxProgress =
        Math.max(fromProgress, toProgress) +
        progressPadding +
        (strokeLength <= 1 ? progressPadding : 0);

      for (let index = 0; index < beadPoints.length; index += 1) {
        const beadPoint = beadPoints[index];
        const centerX = beadPoint.x + bead / 2;
        const centerY = beadPoint.y + bead / 2;
        const relativeX = centerX - guide.start.x;
        const relativeY = centerY - guide.start.y;
        const progress = relativeX * guide.unitX + relativeY * guide.unitY;

        if (progress < minProgress || progress > maxProgress) {
          continue;
        }

        const signedDistance = relativeX * guide.normalX + relativeY * guide.normalY;

        if (signedDistance >= lowerDistance && signedDistance <= upperDistance) {
          indices.push(index);
        }
      }

      return applyPaintToCellIndices(indices);
    };

    const applyPaintAtClientPoint = (clientX: number, clientY: number) => {
      if (!isPaintTool()) return;

      const rawBoardPoint = getBoardPointFromClient(clientX, clientY);
      if (!rawBoardPoint) return;

      let boardPoint = rawBoardPoint;

      if (rulerDrawActiveRef.current) {
        const guidedBoardPoint = getRulerGuidedBoardPoint(clientX, clientY, true);

        if (!guidedBoardPoint) {
          return;
        }

        boardPoint = guidedBoardPoint;
      }

      const lastPaintBoardPoint = lastPaintBoardPointRef.current;

      if (rulerDrawActiveRef.current) {
        if (lastPaintBoardPoint) {
          applyPaintRulerLineBetweenBoardPoints(lastPaintBoardPoint, boardPoint);
        } else {
          applyPaintRulerLineBetweenBoardPoints(boardPoint, boardPoint);
        }
      } else if (lastPaintBoardPoint) {
        applyPaintLineBetweenBoardPoints(lastPaintBoardPoint, boardPoint);
      } else {
        applyPaintLineBetweenBoardPoints(boardPoint, boardPoint);
      }

      lastPaintBoardPointRef.current = boardPoint;
    };

    const rasterizeBoardDrawingToCells = (drawBoard: (context: CanvasRenderingContext2D) => void) => {
      const rasterCanvas = document.createElement("canvas");
      const rasterDpr = 2;

      rasterCanvas.width = Math.max(1, Math.ceil(boardWidth * rasterDpr));
      rasterCanvas.height = Math.max(1, Math.ceil(boardHeight * rasterDpr));

      const context = rasterCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) return false;

      context.scale(rasterDpr, rasterDpr);
      drawBoard(context);

      const imageData = context.getImageData(0, 0, rasterCanvas.width, rasterCanvas.height).data;
      const next = [...cellColorsRef.current];
      let hasChanges = false;

      for (let index = 0; index < beadPoints.length; index += 1) {
        const point = beadPoints[index];
        const currentColor = next[index] ?? baseColor;

        if (isInactiveColor(currentColor)) continue;

        const sampleX = clamp(
          Math.round((point.x + bead / 2) * rasterDpr),
          0,
          rasterCanvas.width - 1,
        );
        const sampleY = clamp(
          Math.round((point.y + bead / 2) * rasterDpr),
          0,
          rasterCanvas.height - 1,
        );
        const alphaIndex = (sampleY * rasterCanvas.width + sampleX) * 4 + 3;

        if (imageData[alphaIndex] < 16 || currentColor === activeColor) {
          continue;
        }

        next[index] = activeColor;
        hasChanges = true;
      }

      if (!hasChanges) return false;

      pushUndoSnapshot(cellColorsRef.current);
      applyCellColors(next);
      flushParentCells();
      return true;
    };

    const drawShapeOnBoard = (
      context: CanvasRenderingContext2D,
      shape: ShapeState,
      currentShapeType: ShapeType,
    ) => {
      const minX = Math.min(shape.start.x, shape.end.x);
      const maxX = Math.max(shape.start.x, shape.end.x);
      const minY = Math.min(shape.start.y, shape.end.y);
      const maxY = Math.max(shape.start.y, shape.end.y);
      const shapeWidth = Math.max(1, maxX - minX);
      const shapeHeight = Math.max(1, maxY - minY);
      const centerShapeX = minX + shapeWidth / 2;
      const centerShapeY = minY + shapeHeight / 2;
      const squareSide = Math.max(1, Math.min(shapeWidth, shapeHeight));
      const squareX = centerShapeX - squareSide / 2;
      const squareY = centerShapeY - squareSide / 2;
      const strokeWidth = Math.max(bead * 0.34, safeToolSize * bead * 0.24);

      const drawArrowHead = (fromX: number, fromY: number, toX: number, toY: number) => {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const headLength = Math.min(bead * 2.4, Math.max(bead * 1.1, Math.hypot(toX - fromX, toY - fromY) * 0.2));
        const headAngle = Math.PI / 7;

        context.moveTo(toX, toY);
        context.lineTo(
          toX - Math.cos(angle - headAngle) * headLength,
          toY - Math.sin(angle - headAngle) * headLength,
        );
        context.moveTo(toX, toY);
        context.lineTo(
          toX - Math.cos(angle + headAngle) * headLength,
          toY - Math.sin(angle + headAngle) * headLength,
        );
      };

      context.save();
      context.translate(centerShapeX, centerShapeY);
      context.rotate(((shape.rotation || 0) * Math.PI) / 180);
      context.translate(-centerShapeX, -centerShapeY);
      context.fillStyle = "rgba(0,0,0,1)";
      context.strokeStyle = "rgba(0,0,0,1)";
      context.lineWidth = strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();

      if (currentShapeType === "oval") {
        context.ellipse(centerShapeX, centerShapeY, shapeWidth / 2, shapeHeight / 2, 0, 0, Math.PI * 2);
        context.fill();
      } else if (currentShapeType === "circle") {
        context.ellipse(centerShapeX, centerShapeY, squareSide / 2, squareSide / 2, 0, 0, Math.PI * 2);
        context.fill();
      } else if (currentShapeType === "square") {
        context.roundRect(squareX, squareY, squareSide, squareSide, bead * 0.18);
        context.fill();
      } else if (currentShapeType === "triangle") {
        context.moveTo(centerShapeX, minY);
        context.lineTo(maxX, maxY);
        context.lineTo(minX, maxY);
        context.closePath();
        context.fill();
      } else if (currentShapeType === "cross") {
        context.moveTo(squareX, squareY);
        context.lineTo(squareX + squareSide, squareY + squareSide);
        context.moveTo(squareX + squareSide, squareY);
        context.lineTo(squareX, squareY + squareSide);
        context.stroke();
      } else if (currentShapeType === "arrow") {
        context.moveTo(shape.start.x, shape.start.y);
        context.lineTo(shape.end.x, shape.end.y);
        drawArrowHead(shape.start.x, shape.start.y, shape.end.x, shape.end.y);
        context.stroke();
      } else {
        context.moveTo(shape.start.x, shape.start.y);
        context.lineTo(shape.end.x, shape.end.y);
        drawArrowHead(shape.start.x, shape.start.y, shape.end.x, shape.end.y);
        drawArrowHead(shape.end.x, shape.end.y, shape.start.x, shape.start.y);
        context.stroke();
      }

      context.restore();
    };

    const drawTextOnBoard = (context: CanvasRenderingContext2D, box: TextBoxState, layer: TextLayer) => {
      const minX = Math.min(box.start.x, box.end.x);
      const maxX = Math.max(box.start.x, box.end.x);
      const minY = Math.min(box.start.y, box.end.y);
      const maxY = Math.max(box.start.y, box.end.y);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const layerTextSize = clamp(Math.round(layer.size), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
      const layerTextValue = layer.value.trim();
      const lines = layerTextValue.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length === 0) return;

      const lineHeight = layerTextSize * 1.18;
      const totalTextHeight = lineHeight * lines.length;
      const startTextY = -totalTextHeight / 2 + lineHeight / 2;
      const textX = 0;
      const centerTextX = minX + width / 2;
      const centerTextY = minY + height / 2;
      const rotationRadians = ((layer.rotation || 0) * Math.PI) / 180;

      context.save();
      context.translate(centerTextX, centerTextY);
      context.rotate(rotationRadians);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `900 ${layerTextSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      context.lineJoin = "round";
      context.lineCap = "round";

      context.fillStyle = layer.color;
      lines.forEach((line, index) => {
        context.fillText(line, textX, startTextY + index * lineHeight);
      });

      context.restore();
    };

    addCurrentShapeRef.current = (nextShapeType?: ShapeType) => {
      shapeWasClearedRef.current = false;
      const nextActiveId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const resolvedShapeType = nextShapeType ?? shapeType;
      const previousShape = shapePreviewRef.current;
      const nextPreview = createDefaultShape(resolvedShapeType);
      const nextPlacedShapes = previousShape
        ? [
            ...placedShapesRef.current,
            {
              id: activeShapeIdRef.current ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: activeShapeTypeRef.current,
              color: activeShapeColorRef.current,
              start: previousShape.start,
              end: previousShape.end,
              rotation: previousShape.rotation || 0,
            },
          ]
        : [...placedShapesRef.current];

      placedShapesRef.current = nextPlacedShapes;
      shapePreviewRef.current = nextPreview;
      activeShapeIdRef.current = nextActiveId;
      activeShapeTypeRef.current = resolvedShapeType;
      activeShapeColorRef.current = activeColor;

      setPlacedShapes(nextPlacedShapes);
      setShapePreview(nextPreview);
      setActiveShapeId(nextActiveId);
      setActiveShapeType(resolvedShapeType);
      setActiveShapeColor(activeColor);
      onShapeTypeChange?.(resolvedShapeType);
      onShapeLayerSelect?.(nextActiveId);
      syncShapeLayersToParent([
        ...nextPlacedShapes,
        {
          id: nextActiveId,
          type: resolvedShapeType,
          color: activeColor,
          start: nextPreview.start,
          end: nextPreview.end,
          rotation: nextPreview.rotation || 0,
        },
      ], nextActiveId);
    };

    applyCurrentShapeRef.current = () => {
      if (tool === "text") {
        rasterizeBoardDrawingToCells((context) => {
          resolvedTextLayers.forEach((layer, index) => {
            if (!layer.value.trim()) return;

            const box = textBoxes[layer.id] ?? createDefaultTextBox(index, layer.size);
            drawTextOnBoard(context, box, layer);
          });
        });
        textWasClearedRef.current = false;
        return;
      }

      if (tool !== "shape") return;

      const currentShape = shapePreview ?? createDefaultShape();

      rasterizeBoardDrawingToCells((context) => {
        drawShapeOnBoard(context, currentShape, activeShapeType);
      });
      setShapePreview(currentShape);
      onShapeLayerChange?.(true);
      shapeWasClearedRef.current = false;
    };

    clearCurrentShapeRef.current = () => {
      if (tool === "text") {
        setTextBoxes((previousBoxes) => {
          const nextBoxes = { ...previousBoxes };
          delete nextBoxes[activeTextLayer.id];
          return nextBoxes;
        });
        textWasClearedRef.current = true;
        return;
      }

      if (tool !== "shape") return;

      shapePreviewRef.current = null;
      activeShapeIdRef.current = null;
      setShapePreview(null);
      setActiveShapeId(null);
      onShapeLayerSelect?.(null);
      syncShapeLayersToParent([...placedShapesRef.current], null);
      shapeWasClearedRef.current = true;
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
      lastPaintBoardPointRef.current = null;
      rulerDrawActiveRef.current = false;

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

    const setPreviewCellIndexFast = (cellIndex: number | null) => {
      if (previewCellIndexRef.current === cellIndex) return;

      previewCellIndexRef.current = cellIndex;
      setPreviewCellIndex(cellIndex);
    };

    const updatePreviewAtClientPoint = (clientX: number, clientY: number) => {
      if (tool !== "brush" && tool !== "erase" && tool !== "add" && tool !== "deactivate") {
        setPreviewCellIndexFast(null);
        return;
      }

      const boardPoint = getBoardPointFromClient(clientX, clientY);

      if (!boardPoint) {
        setPreviewCellIndexFast(null);
        return;
      }

      const previewBoardPoint =
        getRulerGuidedBoardPoint(clientX, clientY, false) ?? boardPoint;
      const cellIndex = getCellIndexAtBoardPoint(previewBoardPoint.x, previewBoardPoint.y);
      setPreviewCellIndexFast(cellIndex);
    };

    const clearPreview = () => {
      setPreviewCellIndexFast(null);
    };

    const startRulerDrag = (
      boardPoint: RulerPoint,
      mode: RulerDragMode,
      currentRuler: RulerState,
    ) => {
      if (!mode) return false;

      rulerDragRef.current = {
        mode,
        startBoardPoint: boardPoint,
        startRuler: currentRuler,
      };

      dragging.current = false;
      painting.current = false;
      clearPreview();
      return true;
    };

    const startPan = (e: React.MouseEvent | React.TouchEvent) => {
      lastInputWasTouchRef.current = "touches" in e;

      if ("touches" in e && e.touches.length >= 2) {
        startPinch(e);
        return;
      }

      if (isPinchingRef.current) return;

      const point = getClientPoint(e);

      updatePreviewAtClientPoint(point.x, point.y);
      tapStartPointRef.current = point;
      tapStillValidRef.current = true;

      const boardPoint = getBoardPointFromClient(point.x, point.y);

      if (boardPoint && isPaintTool()) {
        const guidedBoardPoint = getRulerGuidedBoardPoint(point.x, point.y, false);

        if (guidedBoardPoint) {
          e.preventDefault();
          rulerDrawActiveRef.current = true;
          painting.current = true;
          strokeSnapshotRef.current = [...cellColorsRef.current];
          strokeHasChangesRef.current = false;
          lastPaintBoardPointRef.current = null;
          applyPaintAtClientPoint(point.x, point.y);
          return;
        }
      }

      if (boardPoint && rulerVisible && !rulerLocked && rulerRef.current) {
        const hitMode = getRulerHitAtClientPoint(point.x, point.y);

        if (hitMode && startRulerDrag(boardPoint, hitMode, rulerRef.current)) {
          return;
        }
      }

      if (tool === "ruler") {
        if (!boardPoint || !rulerVisible || rulerLocked) return;

        const currentRuler = rulerRef.current ?? createDefaultRuler();

        if (!rulerRef.current) {
          syncRuler(currentRuler);
        }

        rulerDragRef.current = {
          mode: "end",
          startBoardPoint: boardPoint,
          startRuler: { start: boardPoint, end: boardPoint },
        };

        syncRuler({
          start: boardPoint,
          end: boardPoint,
        });

        clearPreview();
        return;
      }

      if (tool === "text") {
        if (!boardPoint || !hasRealTextLayers) return;

        for (let index = visibleTextLayers.length - 1; index >= 0; index -= 1) {
          const layer = visibleTextLayers[index];
          const currentTextBox = textBoxes[layer.id] ?? layer.box ?? createDefaultTextBox(index, layer.size);

          if (getTextHitAtClientPoint(point.x, point.y, currentTextBox, layer)) {
            onTextCanvasPointerDown?.(layer.id);

            if (layer.id !== activeTextLayer.id) {
              onTextLayerSelect?.(layer.id);
            }

            if (textInteractionMode === "move") {
              startShapeDrag(boardPoint, "body", currentTextBox, layer.id, layer.rotation || 0);
            } else if (textInteractionMode === "rotate") {
              startShapeDrag(boardPoint, "end", currentTextBox, layer.id, layer.rotation || 0);
            }

            clearPreview();
            return;
          }
        }

        onTextCanvasPointerDown?.(null);
        clearPreview();
        return;
      }

      if (tool === "shape") {
        e.preventDefault();
        if (!boardPoint) return;

        const currentShape = shapePreview ?? createDefaultShape();

        if (shapePreview) {
          const hitMode = getShapeHitAtClientPoint(point.x, point.y, currentShape, activeShapeType, shapeInteractionMode === "size");

          if (hitMode) {
            const dragMode = shapeInteractionMode === "rotate" ? "rotate" : shapeInteractionMode === "size" ? hitMode : "body";

            // Важно: обычный тап по активной фигуре НЕ запускает drag.
            // Иначе даже короткое нажатие отправляет обновление наверх в GridScreen,
            // из-за чего начинает дергаться и фигура, и тулбар.
            // Drag стартует только когда палец/мышь реально сдвинулись.
            pendingShapeDragRef.current = {
              mode: dragMode,
              startClientPoint: point,
              startBoardPoint: boardPoint,
              startShape: currentShape,
              startShapeRotation: currentShape.rotation || 0,
            };
            dragging.current = false;
            painting.current = false;
            clearPreview();
            return;
          }
        }

        for (let index = placedShapes.length - 1; index >= 0; index -= 1) {
          const placedShape = placedShapes[index];
          const hitMode = getShapeHitAtClientPoint(
            point.x,
            point.y,
            placedShape,
            placedShape.type,
            shapeInteractionMode === "size",
          );

          if (!hitMode) continue;

          const selectedShape: ShapeState = {
            start: placedShape.start,
            end: placedShape.end,
            rotation: placedShape.rotation || 0,
          };
          const previousActiveShape = shapePreview;
          const previousActiveShapeId = activeShapeId;
          const previousActiveShapeType = activeShapeType;
          const previousActiveShapeColor = activeShapeColor;

          const nextPlacedShapes = (() => {
            const withoutSelected = placedShapes.filter((item) => item.id !== placedShape.id);

            if (!previousActiveShape) return withoutSelected;

            return [
              ...withoutSelected,
              {
                id: previousActiveShapeId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                type: previousActiveShapeType,
                color: previousActiveShapeColor,
                start: previousActiveShape.start,
                end: previousActiveShape.end,
                rotation: previousActiveShape.rotation || 0,
              },
            ];
          })();

          pendingShapeDragRef.current = null;
          placedShapesRef.current = nextPlacedShapes;
          shapePreviewRef.current = selectedShape;
          activeShapeIdRef.current = placedShape.id;
          activeShapeTypeRef.current = placedShape.type;
          activeShapeColorRef.current = placedShape.color;

          setPlacedShapes(nextPlacedShapes);
          setActiveShapeId(placedShape.id);
          setActiveShapeType(placedShape.type);
          setActiveShapeColor(placedShape.color);
          onShapeTypeChange?.(placedShape.type);
          onShapeLayerSelect?.(placedShape.id);
          onShapeLayerChange?.(true);
          setShapePreview(selectedShape);
          syncShapeLayersToParent([
            ...nextPlacedShapes,
            {
              id: placedShape.id,
              type: placedShape.type,
              color: placedShape.color,
              start: selectedShape.start,
              end: selectedShape.end,
              rotation: selectedShape.rotation || 0,
            },
          ], placedShape.id);

          // Тап по другой фигуре только выбирает её.
          // Движение начнётся только после отдельного drag по уже активной фигуре.
          clearPreview();
          return;
        }

        // Тап в пустую область не переносит активную фигуру в точку нажатия.
        // Это убирает прыжок фигуры из центра к месту тапа.
        clearPreview();
        return;
      }

      if (tool === "move") {
        dragging.current = true;
        lastPoint.current = point;
        return;
      }

      if (tool === "brush" || tool === "erase" || tool === "add" || tool === "deactivate") {
        rulerDrawActiveRef.current = false;
        painting.current = true;
        strokeSnapshotRef.current = [...cellColorsRef.current];
        strokeHasChangesRef.current = false;
        lastPaintBoardPointRef.current = null;

        // Важно: одинарный тап должен красить/стирать сразу, без необходимости вести пальцем.
        applyPaintAtClientPoint(point.x, point.y);
      }
    };

    const movePan = (e: React.MouseEvent | React.TouchEvent) => {
      lastInputWasTouchRef.current = "touches" in e;

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

      const activeRulerDrag = rulerDragRef.current;

      if (activeRulerDrag.mode && !rulerLocked) {
        const boardPoint = getBoardPointFromClient(point.x, point.y);

        if (!boardPoint || !activeRulerDrag.startBoardPoint || !activeRulerDrag.startRuler) {
          return;
        }

        if (activeRulerDrag.mode === "start") {
          syncRuler({
            start: boardPoint,
            end: activeRulerDrag.startRuler.end,
          });
          return;
        }

        if (activeRulerDrag.mode === "end") {
          syncRuler({
            start: activeRulerDrag.startRuler.start,
            end: boardPoint,
          });
          return;
        }

        const dx = boardPoint.x - activeRulerDrag.startBoardPoint.x;
        const dy = boardPoint.y - activeRulerDrag.startBoardPoint.y;

        syncRuler({
          start: {
            x: activeRulerDrag.startRuler.start.x + dx,
            y: activeRulerDrag.startRuler.start.y + dy,
          },
          end: {
            x: activeRulerDrag.startRuler.end.x + dx,
            y: activeRulerDrag.startRuler.end.y + dy,
          },
        });
        return;
      }

      const pendingShapeDrag = pendingShapeDragRef.current;

      if (pendingShapeDrag) {
        e.preventDefault();
        const dx = point.x - pendingShapeDrag.startClientPoint.x;
        const dy = point.y - pendingShapeDrag.startClientPoint.y;

        const dragStartThreshold = lastInputWasTouchRef.current ? 4 : 2;

        if (Math.hypot(dx, dy) <= dragStartThreshold) {
          return;
        }

        pendingShapeDragRef.current = null;
        startShapeDrag(
          pendingShapeDrag.startBoardPoint,
          pendingShapeDrag.mode,
          pendingShapeDrag.startShape,
          null,
          0,
          pendingShapeDrag.startShapeRotation,
        );
      }

      const activeShapeDrag = shapeDragRef.current;

      if (activeShapeDrag.mode) {
        e.preventDefault();
        const boardPoint = getBoardPointFromClient(point.x, point.y);

        if (!boardPoint || !activeShapeDrag.startBoardPoint || !activeShapeDrag.startShape) {
          return;
        }

        const setActivePreview = (nextPreview: ShapeState) => {
          if (tool === "text") {
            const targetTextLayerId = activeShapeDrag.textLayerId ?? activeTextLayer.id;

            setTextBoxes((previousBoxes) => ({
              ...previousBoxes,
              [targetTextLayerId]: nextPreview,
            }));
            onTextLayerChange?.(targetTextLayerId, { box: nextPreview });
            return;
          }

          shapePreviewRef.current = nextPreview;
          setShapePreview(nextPreview);
        };

        if (tool === "text" && textInteractionMode === "rotate") {
          const targetTextLayerId = activeShapeDrag.textLayerId ?? activeTextLayer.id;
          const box = activeShapeDrag.startShape;

          if (!box) return;

          const centerX = (box.start.x + box.end.x) / 2;
          const centerY = (box.start.y + box.end.y) / 2;
          const startAngle = Math.atan2(
            activeShapeDrag.startBoardPoint.y - centerY,
            activeShapeDrag.startBoardPoint.x - centerX,
          );
          const currentAngle = Math.atan2(boardPoint.y - centerY, boardPoint.x - centerX);
          const nextRotation = Math.round(
            activeShapeDrag.startTextRotation + ((currentAngle - startAngle) * 180) / Math.PI,
          );

          onTextLayerChange?.(targetTextLayerId, { rotation: nextRotation });
          return;
        }


        if (tool === "shape" && activeShapeDrag.mode === "rotate") {
          const currentShape = activeShapeDrag.startShape;
          const centerX = (currentShape.start.x + currentShape.end.x) / 2;
          const centerY = (currentShape.start.y + currentShape.end.y) / 2;
          const startAngle = Math.atan2(
            activeShapeDrag.startBoardPoint.y - centerY,
            activeShapeDrag.startBoardPoint.x - centerX,
          );
          const currentAngle = Math.atan2(boardPoint.y - centerY, boardPoint.x - centerX);
          const nextRotation = Math.round(
            activeShapeDrag.startShapeRotation + ((currentAngle - startAngle) * 180) / Math.PI,
          );

          const nextPreview = {
            ...currentShape,
            rotation: nextRotation,
          };
          shapePreviewRef.current = nextPreview;
          setShapePreview(nextPreview);
          return;
        }

        if (activeShapeDrag.mode === "start") {
          setActivePreview({
            start: boardPoint,
            end: activeShapeDrag.startShape.end,
            rotation: activeShapeDrag.startShape.rotation || 0,
          });
          return;
        }

        if (activeShapeDrag.mode === "end") {
          setActivePreview({
            start: activeShapeDrag.startShape.start,
            end: boardPoint,
            rotation: activeShapeDrag.startShape.rotation || 0,
          });
          return;
        }

        const dx = boardPoint.x - activeShapeDrag.startBoardPoint.x;
        const dy = boardPoint.y - activeShapeDrag.startBoardPoint.y;

        setActivePreview({
          start: {
            x: activeShapeDrag.startShape.start.x + dx,
            y: activeShapeDrag.startShape.start.y + dy,
          },
          end: {
            x: activeShapeDrag.startShape.end.x + dx,
            y: activeShapeDrag.startShape.end.y + dy,
          },
          rotation: activeShapeDrag.startShape.rotation || 0,
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
        e.preventDefault();
        applyPaintAtClientPoint(point.x, point.y);
      }
    };

    const stopPan = (e?: React.MouseEvent | React.TouchEvent) => {
      if (e && "touches" in e && isPinchingRef.current && e.touches.length > 0) {
        return;
      }

      const activeShapeDrag = shapeDragRef.current;

      const shouldApplyTap =
        !activeShapeDrag.mode &&
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
      rulerDragRef.current = {
        mode: null,
        startBoardPoint: null,
        startRuler: null,
      };

      if (activeShapeDrag.mode && tool === "shape") {
        syncShapeLayersToParent();
      }

      pendingShapeDragRef.current = null;
      shapeDragRef.current = {
        mode: null,
        startBoardPoint: null,
        startShape: null,
        textLayerId: null,
        startTextRotation: 0,
        startShapeRotation: 0,
      };
      isPinchingRef.current = false;
      clearPreview();
      tapStartPointRef.current = null;
      tapStillValidRef.current = false;

      if (strokeHasChangesRef.current) {
        flushParentCells();
      }

      strokeSnapshotRef.current = null;
      strokeHasChangesRef.current = false;
      lastPaintBoardPointRef.current = null;
      rulerDrawActiveRef.current = false;
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
