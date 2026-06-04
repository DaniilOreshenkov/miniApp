import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import CanvasGrid, { type CanvasGridHandle, type ShapeLayer } from "../components/CanvasGrid";
import BottomToolbar from "../components/BottomToolbar";
import ResizeProjectScreen, {
  type ResizeHorizontalAnchor,
  type ResizeVerticalAnchor,
} from "./ResizeProjectScreen";
import AppAlert from "../components/AppAlert";
import ExportScreen from "./ExportScreen";
import { getActivePlan } from "../entities/subscription/plans";
import type { ExportAspectRatio } from "../components/CanvasGrid";
import type { AppTheme, GridData, GridProject, GridSeed } from "../App";

interface Props {
  onBack?: () => void;
  data: GridData | null;
  onSave: (project: GridProject) => void;
  onOpenPaywall?: (feature?: string) => void;
}

type GridAlertState = {
  title: string;
  message: string;
};

const getDocumentTheme = (): AppTheme => {
  if (typeof document === "undefined") return "dark";

  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
};

type Tool = "move" | "brush" | "erase" | "add" | "deactivate" | "ruler" | "shape" | "text" | "background";
type ShapeType = "oval" | "circle" | "square" | "triangle" | "cross" | "arrow" | "doubleArrow";
type TextStyle = "plain" | "bubble" | "shadow";
type TextPanelMode = "text" | "size";
type TextInteractionMode = "edit" | "move" | "rotate";
type ShapeInteractionMode = "move" | "rotate" | "size";
type ShapeFillMode = "fill" | "stroke";
type CanvasPaddingPercent = 0 | 25 | 50;
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

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
};

const getTelegramWebApp = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const maybeWindow = window as Window & {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  };

  return maybeWindow.Telegram?.WebApp ?? null;
};

const lockTelegramViewport = () => {
  const tg = getTelegramWebApp();

  if (!tg) return;

  tg.ready?.();
  tg.expand?.();
  tg.disableVerticalSwipes?.();

  // Fullscreen запрашивается централизованно в app/telegramViewport.
  // Здесь не дергаем requestFullscreen на каждом pointermove/interval,
  // иначе Telegram WebView может заметно прыгать.
};


// Боковые и верхние отступы — safe-bottom убрали отсюда,
// он учитывается внутри canvas (paddingBottom) и BottomToolbar (bottom)
const MOBILE_SCREEN_PADDING =
  "var(--app-safe-top, 0px) 16px 0px";


const RECENT_COLORS_STORAGE_KEY = "beadly-recent-colors-v1";
const DEFAULT_RECENT_COLORS = ["#111111", "#ffffff", "#ff3b30", "#007aff", "#34c759"];

const createTextLayer = (id: number): TextLayer => ({
  id,
  value: "",
  color: "#ffffff",
  size: 34,
  style: "plain",
  rotation: 0,
});

const DEFAULT_TEXT_LAYERS: TextLayer[] = [];

const normalizeTextLayer = (layer: Partial<TextLayer> & { id: number }): TextLayer => ({
  id: layer.id,
  value: typeof layer.value === "string" ? layer.value : "",
  color: typeof layer.color === "string" ? layer.color : "#111111",
  size: typeof layer.size === "number" ? layer.size : 34,
  style: layer.style ?? "plain",
  rotation: typeof layer.rotation === "number" ? layer.rotation : 0,
  box: layer.box,
});

type ProjectTextData = {
  textLayers?: TextLayer[];
};

const getProjectTextLayers = (project: GridProject | null): TextLayer[] => {
  const storedLayers = (project as (GridProject & ProjectTextData) | null)?.textLayers;

  if (!Array.isArray(storedLayers)) return DEFAULT_TEXT_LAYERS;

  return storedLayers
    .filter((layer): layer is TextLayer => Boolean(layer && typeof layer.id === "number"))
    .map(normalizeTextLayer);
};

const areTextLayersEqual = (first: TextLayer[], second: TextLayer[]) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    const firstLayer = first[index];
    const secondLayer = second[index];

    if (
      firstLayer.id !== secondLayer.id ||
      firstLayer.value !== secondLayer.value ||
      firstLayer.color !== secondLayer.color ||
      firstLayer.size !== secondLayer.size ||
      firstLayer.style !== secondLayer.style ||
      firstLayer.rotation !== secondLayer.rotation ||
      JSON.stringify(firstLayer.box ?? null) !== JSON.stringify(secondLayer.box ?? null)
    ) {
      return false;
    }
  }

  return true;
};

type ProjectShapeData = {
  shapeLayers?: ShapeLayer[];
  activeShapeLayerId?: string | null;
};

const SHAPE_TYPES: ShapeType[] = ["oval", "circle", "square", "triangle", "cross", "arrow", "doubleArrow"];

const normalizeShapePoint = (point: unknown) => {
  const maybePoint = point as { x?: unknown; y?: unknown } | null;

  return {
    x: typeof maybePoint?.x === "number" ? maybePoint.x : 0,
    y: typeof maybePoint?.y === "number" ? maybePoint.y : 0,
  };
};

const normalizeShapeLayer = (layer: Partial<ShapeLayer> & { id: string }): ShapeLayer => ({
  id: String(layer.id),
  type: SHAPE_TYPES.includes(layer.type as ShapeType) ? (layer.type as ShapeType) : "oval",
  color: typeof layer.color === "string" ? layer.color : "#111111",
  fillMode: layer.fillMode === "stroke" ? "stroke" : "fill",
  start: normalizeShapePoint(layer.start),
  end: normalizeShapePoint(layer.end),
  rotation: typeof layer.rotation === "number" ? layer.rotation : 0,
});

const getProjectShapeLayers = (project: GridProject | null): ShapeLayer[] => {
  const storedLayers = (project as (GridProject & ProjectShapeData) | null)?.shapeLayers;

  if (!Array.isArray(storedLayers)) return [];

  return storedLayers
    .filter((layer): layer is ShapeLayer => Boolean(layer && typeof layer.id === "string"))
    .map(normalizeShapeLayer);
};

const getProjectActiveShapeLayerId = (project: GridProject | null, layers: ShapeLayer[]) => {
  const storedActiveId = (project as (GridProject & ProjectShapeData) | null)?.activeShapeLayerId;

  if (storedActiveId && layers.some((layer) => layer.id === storedActiveId)) {
    return storedActiveId;
  }

  return layers[layers.length - 1]?.id ?? null;
};

const areShapeLayersEqual = (first: ShapeLayer[], second: ShapeLayer[]) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    const firstLayer = first[index];
    const secondLayer = second[index];

    if (
      firstLayer.id !== secondLayer.id ||
      firstLayer.type !== secondLayer.type ||
      firstLayer.color !== secondLayer.color ||
      (firstLayer.fillMode ?? "fill") !== (secondLayer.fillMode ?? "fill") ||
      firstLayer.rotation !== secondLayer.rotation ||
      JSON.stringify(firstLayer.start) !== JSON.stringify(secondLayer.start) ||
      JSON.stringify(firstLayer.end) !== JSON.stringify(secondLayer.end)
    ) {
      return false;
    }
  }

  return true;
};
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const DEFAULT_CANVAS_PADDING_PERCENT: CanvasPaddingPercent = 50;

const MAX_BACKGROUND_IMAGE_SOURCE_BYTES = 18 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_FALLBACK_BYTES = 2 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_SIDE = 768;
const BACKGROUND_IMAGE_QUALITY = 0.62;

const loadImageElement = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось загрузить картинку"));
    image.src = src;
  });
};

const readFileAsDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        resolve(result);
        return;
      }

      reject(new Error("Не удалось прочитать файл"));
    };

    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
};

const readBlobAsDataUrl = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        resolve(result);
        return;
      }

      reject(new Error("Не удалось подготовить картинку"));
    };

    reader.onerror = () => reject(new Error("Не удалось подготовить картинку"));
    reader.readAsDataURL(blob);
  });
};

const canvasToJpegBlob = (canvas: HTMLCanvasElement) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Не удалось сжать картинку"));
      },
      "image/jpeg",
      BACKGROUND_IMAGE_QUALITY,
    );
  });
};

const createCompressedBackgroundImage = async (file: File) => {
  if (file.size > MAX_BACKGROUND_IMAGE_SOURCE_BYTES) {
    throw new Error("Картинка слишком большая. Выбери фото поменьше.");
  }

  if (typeof document === "undefined" || typeof window === "undefined") {
    return readFileAsDataUrl(file);
  }

  let objectUrl: string | null = null;

  try {
    objectUrl = window.URL.createObjectURL(file);
    const image = await loadImageElement(objectUrl);
    const originalWidth = Math.max(1, image.naturalWidth || image.width);
    const originalHeight = Math.max(1, image.naturalHeight || image.height);
    const scale = Math.min(1, MAX_BACKGROUND_IMAGE_SIDE / Math.max(originalWidth, originalHeight));
    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement("canvas");

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Не удалось подготовить картинку");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToJpegBlob(canvas);
    return await readBlobAsDataUrl(blob);
  } catch {
    if (file.size <= MAX_BACKGROUND_IMAGE_FALLBACK_BYTES) {
      return readFileAsDataUrl(file);
    }

    throw new Error("Не удалось сжать картинку. Попробуй выбрать фото поменьше или сделать скриншот картинки.");
  } finally {
    if (objectUrl) {
      window.URL.revokeObjectURL(objectUrl);
    }
  }
};

type ProjectBackgroundData = {
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  canvasPaddingPercent?: CanvasPaddingPercent;
};

const getProjectBackgroundColor = (project: GridProject | null) => {
  return (project as (GridProject & ProjectBackgroundData) | null)?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
};

const getProjectBackgroundImageUrl = (project: GridProject | null) => {
  return (project as (GridProject & ProjectBackgroundData) | null)?.backgroundImageUrl ?? null;
};

const getProjectCanvasPaddingPercent = (project: GridProject | null): CanvasPaddingPercent => {
  const value = (project as (GridProject & { canvasPaddingPercent?: CanvasPaddingPercent }) | null)?.canvasPaddingPercent;
  return value !== undefined ? value : DEFAULT_CANVAS_PADDING_PERCENT;
};

const normalizeColor = (color: string) => color.trim().toLowerCase();

const createRecentColors = (color: string, previousColors: string[]) => {
  const normalizedColor = normalizeColor(color);
  const withoutCurrent = previousColors.filter(
    (item) => normalizeColor(item) !== normalizedColor,
  );

  return [normalizedColor, ...withoutCurrent].slice(0, 5);
};

const getStoredRecentColors = () => {
  if (typeof window === "undefined") {
    return DEFAULT_RECENT_COLORS;
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_COLORS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    if (
      Array.isArray(parsedValue) &&
      parsedValue.every((item) => typeof item === "string")
    ) {
      return parsedValue.slice(0, 5);
    }
  } catch {
    // Если localStorage недоступен — просто используем дефолтные цвета.
  }

  return DEFAULT_RECENT_COLORS;
};




const getRowCount = (height: number) => {
  return Math.max(1, height) * 2 + 1;
};

const getRowLength = (width: number, rowIndex: number) => {
  const safeWidth = Math.max(1, width);
  return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
};

const getGridCellCount = (width: number, height: number) => {
  const rowCount = getRowCount(height);

  let count = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    count += getRowLength(width, rowIndex);
  }

  return count;
};

const createFallbackCells = (width: number, height: number) => {
  return Array.from({ length: getGridCellCount(width, height) }, () => "#ffffff");
};

const getResizeOffset = (oldSize: number, newSize: number, anchor: "start" | "center" | "end") => {
  const difference = Math.abs(newSize - oldSize);

  if (anchor === "start") return 0;
  if (anchor === "center") return Math.floor(difference / 2);

  return difference;
};

const getHorizontalOffset = (
  oldRowLength: number,
  newRowLength: number,
  anchor: ResizeHorizontalAnchor,
) => {
  if (anchor === "left") return 0;
  if (anchor === "center") return Math.floor(Math.abs(newRowLength - oldRowLength) / 2);

  return Math.abs(newRowLength - oldRowLength);
};

const resizeCells = (
  oldCells: string[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  horizontalAnchor: ResizeHorizontalAnchor = "center",
  verticalAnchor: ResizeVerticalAnchor = "center",
) => {
  const nextCells = createFallbackCells(newWidth, newHeight);

  const oldRowCount = getRowCount(oldHeight);
  const newRowCount = getRowCount(newHeight);

  const oldRowStartIndices: number[] = [];
  const newRowStartIndices: number[] = [];

  let oldIndex = 0;
  for (let rowIndex = 0; rowIndex < oldRowCount; rowIndex += 1) {
    oldRowStartIndices[rowIndex] = oldIndex;
    oldIndex += getRowLength(oldWidth, rowIndex);
  }

  let newIndex = 0;
  for (let rowIndex = 0; rowIndex < newRowCount; rowIndex += 1) {
    newRowStartIndices[rowIndex] = newIndex;
    newIndex += getRowLength(newWidth, rowIndex);
  }

  const verticalDirection = verticalAnchor === "top"
    ? "start"
    : verticalAnchor === "center"
      ? "center"
      : "end";

  const oldRowCropOffset = oldRowCount > newRowCount
    ? getResizeOffset(oldRowCount, newRowCount, verticalDirection)
    : 0;

  const newRowPlaceOffset = newRowCount > oldRowCount
    ? getResizeOffset(oldRowCount, newRowCount, verticalDirection)
    : 0;

  for (let newRowIndex = 0; newRowIndex < newRowCount; newRowIndex += 1) {
    const oldRowIndex = newRowIndex - newRowPlaceOffset + oldRowCropOffset;

    if (oldRowIndex < 0 || oldRowIndex >= oldRowCount) continue;

    const oldRowLength = getRowLength(oldWidth, oldRowIndex);
    const newRowLength = getRowLength(newWidth, newRowIndex);

    const oldColumnCropOffset = oldRowLength > newRowLength
      ? getHorizontalOffset(oldRowLength, newRowLength, horizontalAnchor)
      : 0;

    const newColumnPlaceOffset = newRowLength > oldRowLength
      ? getHorizontalOffset(oldRowLength, newRowLength, horizontalAnchor)
      : 0;

    for (let newColumnIndex = 0; newColumnIndex < newRowLength; newColumnIndex += 1) {
      const oldColumnIndex = newColumnIndex - newColumnPlaceOffset + oldColumnCropOffset;

      if (oldColumnIndex < 0 || oldColumnIndex >= oldRowLength) continue;

      const oldCell = oldCells[oldRowStartIndices[oldRowIndex] + oldColumnIndex];

      if (oldCell) {
        nextCells[newRowStartIndices[newRowIndex] + newColumnIndex] = oldCell;
      }
    }
  }

  return nextCells;
};

const areArraysEqual = (first: string[], second: string[]) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
};


const GridScreen: React.FC<Props> = ({ onBack, data, onSave, onOpenPaywall }) => {
  const plan = getActivePlan();

  // Определяем права доступа по плану проекта и текущему плану:
  // - monthly/pro → полный доступ ко всем проектам
  // - starter/free + стартерный проект → редактировать можно, но со стартерными ограничениями
  // - starter/free + месячный проект → view-only (подписка нужна для редактирования)
  const hasFullAccess = plan.id === "monthly" || plan.id === "pro";
  // Старые проекты без метки: если у пользователя нет полного доступа — считаем стартерными
  // (чтобы не заблокировать существующих пользователей). При полном доступе метка не важна.
  const projectPlan = data?.createdWithPlan ?? (hasFullAccess ? "monthly" : "starter");
  const isStarterProject = projectPlan === "starter";
  const isViewOnly = !hasFullAccess && !isStarterProject;
  // Для стартерных проектов — стартерные ограничения даже при месячном плане (нет смысла менять)
  // При наличии месячного/про — используем текущий план
  const effectivePlan = hasFullAccess ? plan : { ...plan, canResize: false, canBg: false, canWatermark: false };
  const [tool, setTool] = useState<Tool>("brush");
  const [activeColor, setActiveColor] = useState("#111111");
  const [backgroundColor, setBackgroundColor] = useState(() => getProjectBackgroundColor(data));
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(() => getProjectBackgroundImageUrl(data));
  const [canvasPaddingPercent, setCanvasPaddingPercent] = useState<CanvasPaddingPercent>(() => getProjectCanvasPaddingPercent(data));
  const [recentColors, setRecentColors] = useState<string[]>(getStoredRecentColors);
  const [toolSize, setToolSize] = useState(1);
  const [isRulerVisible, setIsRulerVisible] = useState(true);
  const [isRulerLocked, setIsRulerLocked] = useState(false);
  const [rulerSize, setRulerSize] = useState(32);
  const [isRulerTextVisible, setIsRulerTextVisible] = useState(true);
  const [shapeType, setShapeType] = useState<ShapeType>("oval");
  const [shapeLayers, setShapeLayers] = useState<ShapeLayer[]>(() => getProjectShapeLayers(data));
  const [activeShapeLayerId, setActiveShapeLayerId] = useState<string | null>(() =>
    getProjectActiveShapeLayerId(data, getProjectShapeLayers(data)),
  );
  const [hasShapeLayer, setHasShapeLayer] = useState(() => getProjectShapeLayers(data).length > 0);
  const [activeTextLayerId, setActiveTextLayerId] = useState(1);
  const [textLayers, setTextLayers] = useState<TextLayer[]>(() => getProjectTextLayers(data));
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isTextPanelVisible, setIsTextPanelVisible] = useState(false);
  const [textPanelMode, setTextPanelMode] = useState<TextPanelMode>("text");
  const [textInteractionMode, setTextInteractionMode] = useState<TextInteractionMode>("edit");
  const [shapeInteractionMode, setShapeInteractionMode] = useState<ShapeInteractionMode>("move");

  const nextTextLayerIdRef = useRef(1);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTextLayerIdRef = useRef(activeTextLayerId);
  const activeTextLayer =
    textLayers.find((layer) => layer.id === activeTextLayerId) ?? textLayers[0] ?? createTextLayer(1);
  const activeShapeLayer =
    shapeLayers.find((layer) => layer.id === activeShapeLayerId) ?? shapeLayers[shapeLayers.length - 1] ?? null;
  const activeShapeFillMode: ShapeFillMode = activeShapeLayer?.fillMode === "stroke" ? "stroke" : "fill";
  const drawingColor =
    tool === "text"
      ? activeTextLayer.color
      : tool === "shape"
        ? activeShapeLayer?.color ?? activeColor
        : tool === "background"
          ? backgroundColor
          : activeColor;

  useEffect(() => {
    activeTextLayerIdRef.current = activeTextLayerId;
  }, [activeTextLayerId]);

  useEffect(() => {
    const biggestTextLayerId = textLayers.reduce((maxId, layer) => Math.max(maxId, layer.id), 0);
    nextTextLayerIdRef.current = Math.max(nextTextLayerIdRef.current, biggestTextLayerId + 1);
  }, [textLayers]);

  useEffect(() => {
    if (tool !== "text" || !isTextPanelVisible || textPanelMode !== "text") return;

    const focusTimer = window.setTimeout(() => {
      textInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(focusTimer);
  }, [activeTextLayer.id, isTextPanelVisible, textPanelMode, tool]);

  const safeSaveProject = (project: GridProject) => {
    try {
      onSave(project);
      return true;
    } catch (error) {
      console.error("Не удалось сохранить проект", error);
      setGridAlert({
        title: "Не удалось сохранить",
        message: "Картинка импортировалась, но проект не удалось сохранить. Попробуй фото поменьше.",
      });
      return false;
    }
  };

  const updateActiveTextLayer = (updates: Partial<TextLayer>) => {
    const targetLayerId = activeTextLayerIdRef.current;

    hasEditedInSessionRef.current = true;

    setTextLayers((previousLayers) => {
      if (previousLayers.length === 0) {
        return [{ ...createTextLayer(targetLayerId), ...updates }];
      }

      const hasTargetLayer = previousLayers.some((layer) => layer.id === targetLayerId);

      if (!hasTargetLayer) {
        return previousLayers.map((layer, index) =>
          index === previousLayers.length - 1 ? { ...layer, ...updates } : layer,
        );
      }

      return previousLayers.map((layer) =>
        layer.id === targetLayerId ? { ...layer, ...updates } : layer,
      );
    });
  };

  const handleActiveTextValueChange = (value: string) => {
    updateActiveTextLayer({ value });
  };

  const updateActiveShapeColor = (nextColor: string) => {
    hasEditedInSessionRef.current = true;
    setActiveColor(nextColor);
    canvasGridRef.current?.setActiveShapeColor(nextColor);

    setShapeLayers((previousLayers) => {
      if (previousLayers.length === 0) return previousLayers;

      const targetLayerId = activeShapeLayerId ?? previousLayers[previousLayers.length - 1]?.id ?? null;

      if (!targetLayerId) return previousLayers;

      return previousLayers.map((layer) =>
        layer.id === targetLayerId ? { ...layer, color: nextColor } : layer,
      );
    });
  };


  const updateActiveShapeFillMode = (nextFillMode: ShapeFillMode) => {
    hasEditedInSessionRef.current = true;
    canvasGridRef.current?.setActiveShapeFillMode(nextFillMode);

    setShapeLayers((previousLayers) => {
      if (previousLayers.length === 0) return previousLayers;

      const targetLayerId = activeShapeLayerId ?? previousLayers[previousLayers.length - 1]?.id ?? null;

      if (!targetLayerId) return previousLayers;

      return previousLayers.map((layer) =>
        layer.id === targetLayerId ? { ...layer, fillMode: nextFillMode } : layer,
      );
    });
  };

  const updateTextLayerById = (layerId: number, updates: Partial<TextLayer>) => {
    hasEditedInSessionRef.current = true;
    setTextLayers((previousLayers) =>
      previousLayers.map((layer) => (layer.id === layerId ? { ...layer, ...updates } : layer)),
    );
  };

  const handleToggleTextPanel = () => {
    setTool("text");
    setIsTextPanelVisible((previousValue) => !previousValue);
    setTextPanelMode("text");
    setTextInteractionMode("edit");
  };

  const handleTextInteractionModeChange = (nextMode: TextInteractionMode) => {
    setTool("text");
    setTextInteractionMode(nextMode);
    if (nextMode !== "edit") {
      setIsTextPanelVisible(false);
    }
  };

  const handleAddTextLayer = () => {
    const nextId = nextTextLayerIdRef.current;
    nextTextLayerIdRef.current += 1;

    const nextLayer = createTextLayer(nextId);

    setTextLayers((previousLayers) => [...previousLayers, nextLayer]);
    setActiveTextLayerId(nextId);
    setTool("text");
    setIsTextPanelVisible(true);
    setTextPanelMode("text");
    setTextInteractionMode("edit");
    hasEditedInSessionRef.current = true;

    window.setTimeout(() => {
      textInputRef.current?.focus();
    }, 0);
  };

  const handleRemoveTextLayer = () => {
    const targetLayerId = activeTextLayer.id;

    hasEditedInSessionRef.current = true;
    setIsTextPanelVisible(false);
    setTextPanelMode("text");
    setTextInteractionMode("edit");

    setTextLayers((previousLayers) => {
      const nextLayers = previousLayers.filter((layer) => layer.id !== targetLayerId);
      const nextActiveLayer = nextLayers[nextLayers.length - 1];

      setActiveTextLayerId(nextActiveLayer?.id ?? 1);

      return nextLayers;
    });
  };

  const handleToolChange = (nextTool: Tool) => {
    // View-only режим: все инструменты заблокированы
    if (isViewOnly) {
      onOpenPaywall?.("Редактирование схемы");
      return;
    }
    // Инструмент «Фон» заблокирован для планов без canBg
    if (nextTool === "background" && !effectivePlan.canBg) {
      onOpenPaywall?.("Изменение фона холста");
      return;
    }

    if (nextTool === "text") {
      setTool("text");
      setIsTextPanelVisible(false);
      setTextPanelMode("text");
      setTextInteractionMode("edit");
      return;
    }

    if (nextTool === "shape") {
      setTool("shape");
      setIsTextPanelVisible(false);
      setTextPanelMode("text");
      setShapeInteractionMode("move");
      return;
    }

    setTool(nextTool);
  };

  useEffect(() => {
    if (!isPaletteOpen) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const paletteElement = paletteRef.current;
      const target = event.target;

      if (!(target instanceof Node)) return;
      if (paletteElement?.contains(target)) return;

      setIsPaletteOpen(false);
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [isPaletteOpen]);
  const [isExportSheetOpen, setIsExportSheetOpen] = useState(false);
  const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
  const [colorsPreviewUrl, setColorsPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [exportProjectName, setExportProjectName] = useState("");
  const [isResizeSheetOpen, setIsResizeSheetOpen] = useState(false);
  const [isBackConfirmOpen, setIsBackConfirmOpen] = useState(false);
  const [gridAlert, setGridAlert] = useState<GridAlertState | null>(null);

  const canvasGridRef = useRef<CanvasGridHandle | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const previewTokenRef = useRef(0);
  const previewDebounceRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const getCurrentShapeSnapshot = () => {
    const canvasShapeSnapshot = canvasGridRef.current?.getShapeLayers();

    if (!canvasShapeSnapshot) {
      return {
        layers: shapeLayers,
        activeLayerId: activeShapeLayerId,
      };
    }

    return canvasShapeSnapshot;
  };

  const hasEditedInSessionRef = useRef(false);
  const openedProjectIdRef = useRef<string | null>(data?.id ?? null);
  const originalProjectRef = useRef<GridProject | null>(
    data
      ? {
          ...data,
          cells: [...data.cells],
        }
      : null,
  );

  const isMobileScreen =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);

  const initialCells = useMemo(() => {
    if (!data) return createFallbackCells(10, 10);

    return data.cells.length > 0
      ? data.cells
      : createFallbackCells(data.width, data.height);
  }, [data]);

  const [currentCells, setCurrentCells] = useState<string[]>(initialCells);
  const lastSavedCellsRef = useRef<string[]>(initialCells);
  const lastSavedBackgroundColorRef = useRef(getProjectBackgroundColor(data));
  const lastSavedBackgroundImageUrlRef = useRef<string | null>(getProjectBackgroundImageUrl(data));
  const lastSavedCanvasPaddingPercentRef = useRef<CanvasPaddingPercent>(getProjectCanvasPaddingPercent(data));
  const lastSavedTextLayersRef = useRef<TextLayer[]>(getProjectTextLayers(data));
  const lastSavedShapeLayersRef = useRef<ShapeLayer[]>(getProjectShapeLayers(data));
  const lastSavedActiveShapeLayerIdRef = useRef<string | null>(
    getProjectActiveShapeLayerId(data, getProjectShapeLayers(data)),
  );
  const autosaveTimeoutRef = useRef<number | null>(null);


  useEffect(() => {
    const nextProjectId = data?.id ?? null;
    const isNewProjectOpened = openedProjectIdRef.current !== nextProjectId;

    setCurrentCells(initialCells);
    lastSavedCellsRef.current = initialCells;
    const nextBackgroundColor = getProjectBackgroundColor(data);
    const nextBackgroundImageUrl = getProjectBackgroundImageUrl(data);
    const nextCanvasPaddingPercent = getProjectCanvasPaddingPercent(data);
    setBackgroundColor(nextBackgroundColor);
    setBackgroundImageUrl(nextBackgroundImageUrl);
    setCanvasPaddingPercent(nextCanvasPaddingPercent);
    const nextTextLayers = getProjectTextLayers(data);
    setTextLayers(nextTextLayers);
    const lastTextLayerId = nextTextLayers[nextTextLayers.length - 1]?.id ?? 1;
    setActiveTextLayerId(lastTextLayerId);
    nextTextLayerIdRef.current = Math.max(1, ...nextTextLayers.map((layer) => layer.id + 1));
    const nextShapeLayers = getProjectShapeLayers(data);
    const nextActiveShapeLayerId = getProjectActiveShapeLayerId(data, nextShapeLayers);
    setShapeLayers(nextShapeLayers);
    setActiveShapeLayerId(nextActiveShapeLayerId);
    setHasShapeLayer(nextShapeLayers.length > 0);
    lastSavedTextLayersRef.current = nextTextLayers;
    lastSavedShapeLayersRef.current = nextShapeLayers;
    lastSavedActiveShapeLayerIdRef.current = nextActiveShapeLayerId;
    lastSavedBackgroundColorRef.current = nextBackgroundColor;
    lastSavedBackgroundImageUrlRef.current = nextBackgroundImageUrl;
    lastSavedCanvasPaddingPercentRef.current = nextCanvasPaddingPercent;

    if (isNewProjectOpened) {
      hasEditedInSessionRef.current = false;
      openedProjectIdRef.current = nextProjectId;

      originalProjectRef.current = data
        ? {
            ...data,
            cells: [...data.cells],
          }
        : null;
    }

    if (!originalProjectRef.current && data) {
      originalProjectRef.current = {
        ...data,
        cells: [...data.cells],
      };
    }
  }, [data, data?.id, initialCells]);


  useEffect(() => {
    if (!data) return;

    const isChanged =
      !areArraysEqual(currentCells, lastSavedCellsRef.current) ||
      backgroundColor !== lastSavedBackgroundColorRef.current ||
      backgroundImageUrl !== lastSavedBackgroundImageUrlRef.current ||
      canvasPaddingPercent !== lastSavedCanvasPaddingPercentRef.current ||
      !areTextLayersEqual(textLayers, lastSavedTextLayersRef.current) ||
      !areShapeLayersEqual(shapeLayers, lastSavedShapeLayersRef.current) ||
      activeShapeLayerId !== lastSavedActiveShapeLayerIdRef.current;

    if (!isChanged) return;

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      const currentShapeSnapshot = getCurrentShapeSnapshot();

      const nextProject = {
        ...data,
        cells: currentCells,
        backgroundColor,
        backgroundImageUrl,
        canvasPaddingPercent,
        textLayers,
        shapeLayers: currentShapeSnapshot.layers,
        activeShapeLayerId: currentShapeSnapshot.activeLayerId,
      } as GridProject;

      if (!safeSaveProject(nextProject)) return;

      lastSavedCellsRef.current = currentCells;
      lastSavedBackgroundColorRef.current = backgroundColor;
      lastSavedBackgroundImageUrlRef.current = backgroundImageUrl;
      lastSavedCanvasPaddingPercentRef.current = canvasPaddingPercent;
      lastSavedTextLayersRef.current = textLayers;
      lastSavedShapeLayersRef.current = currentShapeSnapshot.layers;
      lastSavedActiveShapeLayerIdRef.current = currentShapeSnapshot.activeLayerId;
      setShapeLayers(currentShapeSnapshot.layers);
      setActiveShapeLayerId(currentShapeSnapshot.activeLayerId);
      setHasShapeLayer(currentShapeSnapshot.layers.length > 0);
      autosaveTimeoutRef.current = null;
    }, 700);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [
    activeShapeLayerId,
    backgroundColor,
    backgroundImageUrl,
    canvasPaddingPercent,
    currentCells,
    data,
    onSave,
    shapeLayers,
    textLayers,
  ]);

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!isResizeSheetOpen && !isBackConfirmOpen) return;

    lockTelegramViewport();

    const intervalId = window.setInterval(() => {
      lockTelegramViewport();
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isResizeSheetOpen, isBackConfirmOpen]);

  const saveCurrentProject = () => {
    if (!data) return;

    const currentShapeSnapshot = getCurrentShapeSnapshot();

    const nextProject = {
      ...data,
      cells: currentCells,
      backgroundColor,
      backgroundImageUrl,
      canvasPaddingPercent,
      textLayers,
      shapeLayers: currentShapeSnapshot.layers,
      activeShapeLayerId: currentShapeSnapshot.activeLayerId,
    } as GridProject;

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    if (!safeSaveProject(nextProject)) return;

    lastSavedCellsRef.current = currentCells;
    lastSavedBackgroundColorRef.current = backgroundColor;
    lastSavedBackgroundImageUrlRef.current = backgroundImageUrl;
    lastSavedCanvasPaddingPercentRef.current = canvasPaddingPercent;
    lastSavedTextLayersRef.current = textLayers;
    lastSavedShapeLayersRef.current = currentShapeSnapshot.layers;
    lastSavedActiveShapeLayerIdRef.current = currentShapeSnapshot.activeLayerId;
    setShapeLayers(currentShapeSnapshot.layers);
    setActiveShapeLayerId(currentShapeSnapshot.activeLayerId);
    setHasShapeLayer(currentShapeSnapshot.layers.length > 0);
  };

  const handleBack = () => {
    if (!hasEditedInSessionRef.current) {
      onBack?.();
      return;
    }

    setIsPaletteOpen(false);

    setIsResizeSheetOpen(false);
    setIsBackConfirmOpen(true);
  };

  const handleBackCancel = () => {
    setIsBackConfirmOpen(false);
  };

  const handleBackWithoutSave = () => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    if (originalProjectRef.current) {
      const originalProject: GridProject = {
        ...originalProjectRef.current,
        cells: [...originalProjectRef.current.cells],
      };

      safeSaveProject(originalProject);
      setCurrentCells([...originalProject.cells]);
      const originalBackgroundColor = getProjectBackgroundColor(originalProject);
      const originalBackgroundImageUrl = getProjectBackgroundImageUrl(originalProject);
      const originalCanvasPaddingPercent = getProjectCanvasPaddingPercent(originalProject);
      const originalTextLayers = getProjectTextLayers(originalProject);
      const originalShapeLayers = getProjectShapeLayers(originalProject);
      const originalActiveShapeLayerId = getProjectActiveShapeLayerId(originalProject, originalShapeLayers);
      setBackgroundColor(originalBackgroundColor);
      setBackgroundImageUrl(originalBackgroundImageUrl);
      setCanvasPaddingPercent(originalCanvasPaddingPercent);
      setTextLayers(originalTextLayers);
      setActiveTextLayerId(originalTextLayers[originalTextLayers.length - 1]?.id ?? 1);
      setShapeLayers(originalShapeLayers);
      setActiveShapeLayerId(originalActiveShapeLayerId);
      setHasShapeLayer(originalShapeLayers.length > 0);
      lastSavedCellsRef.current = [...originalProject.cells];
      lastSavedBackgroundColorRef.current = originalBackgroundColor;
      lastSavedBackgroundImageUrlRef.current = originalBackgroundImageUrl;
      lastSavedCanvasPaddingPercentRef.current = originalCanvasPaddingPercent;
      lastSavedTextLayersRef.current = originalTextLayers;
      lastSavedShapeLayersRef.current = originalShapeLayers;
      lastSavedActiveShapeLayerIdRef.current = originalActiveShapeLayerId;
    }

    hasEditedInSessionRef.current = false;
    setIsBackConfirmOpen(false);
    onBack?.();
  };

  const handleBackWithSave = () => {
    saveCurrentProject();
    hasEditedInSessionRef.current = false;
    setIsBackConfirmOpen(false);
    onBack?.();
  };

  const handleCellsChange = (nextCells: string[]) => {
    hasEditedInSessionRef.current = true;
    setCurrentCells(nextCells);
  };

  const handleToggleRulerVisible = () => {
    setIsRulerVisible((prev) => !prev);
  };

  const handleToggleRulerLocked = () => {
    setIsRulerLocked((prev) => !prev);
  };

  const handleToggleRulerTextVisible = () => {
    setIsRulerTextVisible((prev) => !prev);
  };

  const handleAddShapeLayer = (nextShapeType?: ShapeType) => {
    const resolvedShapeType = nextShapeType ?? shapeType;

    setTool("shape");
    setShapeType(resolvedShapeType);
    setShapeInteractionMode("move");
    setIsPaletteOpen(false);
    setIsTextPanelVisible(false);
    setTextPanelMode("text");
    canvasGridRef.current?.addCurrentShape(resolvedShapeType);
    setHasShapeLayer(true);
    hasEditedInSessionRef.current = true;
  };

  const handleClearShape = () => {
    canvasGridRef.current?.clearCurrentShape();
    setActiveShapeLayerId(null);
    setHasShapeLayer(shapeLayers.length > 1);
    hasEditedInSessionRef.current = true;
  };

  const handleOpenPalette = () => {

    setIsResizeSheetOpen(false);
    setIsBackConfirmOpen(false);
    setIsPaletteOpen((prev) => !prev);
  };

  const rememberColor = (color: string) => {
    setRecentColors((previousColors) => {
      const nextColors = createRecentColors(color, previousColors);

      try {
        window.localStorage.setItem(
          RECENT_COLORS_STORAGE_KEY,
          JSON.stringify(nextColors),
        );
      } catch {
        // Если localStorage недоступен — просто храним цвета в текущей сессии.
      }

      return nextColors;
    });
  };

  const handleSelectColor = (color: string) => {
    const normalizedColor = normalizeColor(color);

    if (tool === "text") {
      updateActiveTextLayer({ color: normalizedColor });
      rememberColor(normalizedColor);
      setIsPaletteOpen(false);
      return;
    }

    if (tool === "shape") {
      updateActiveShapeColor(normalizedColor);
      rememberColor(normalizedColor);
      setIsPaletteOpen(false);
      return;
    }

    if (tool === "background") {
      setBackgroundColor(normalizedColor);
      setBackgroundImageUrl(null);
      hasEditedInSessionRef.current = true;
      rememberColor(normalizedColor);
      setIsPaletteOpen(false);
      return;
    }

    setActiveColor(normalizedColor);
    rememberColor(normalizedColor);
    setTool("brush");
    setIsPaletteOpen(false);
  };

  const handleImportBackgroundImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    try {
      const compressedImageUrl = await createCompressedBackgroundImage(file);

      setBackgroundImageUrl(compressedImageUrl);
      setBackgroundColor("transparent");
      setIsPaletteOpen(false);
      setTool("background");
      hasEditedInSessionRef.current = true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Не удалось импортировать картинку.";

      setGridAlert({
        title: "Не удалось импортировать",
        message,
      });
    }
  };

  const handleResetBackground = () => {
    setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    setBackgroundImageUrl(null);
    setCanvasPaddingPercent(DEFAULT_CANVAS_PADDING_PERCENT);
    setTool("background");
    setIsPaletteOpen(false);
    hasEditedInSessionRef.current = true;
  };

  const handleCanvasPaddingPercentChange = (nextCanvasPaddingPercent: CanvasPaddingPercent) => {
    setCanvasPaddingPercent(nextCanvasPaddingPercent);
    setTool("background");
    hasEditedInSessionRef.current = true;
  };

  // Токен для отмены устаревших генераций превью (race-condition при быстрой смене настроек)

  /** Читает сохранённые настройки водяного знака из localStorage. */
  const readWatermarkPrefs = (): { enabled: boolean; text: string } => {
    try {
      const raw = localStorage.getItem("beadly-watermark-v1");
      if (raw) return JSON.parse(raw) as { enabled: boolean; text: string };
    } catch { /* ignore */ }
    return { enabled: true, text: "@skapova_studio" };
  };

  const handleOpenExportSheet = async () => {
    if (isGeneratingPreview) return;

    if (isViewOnly) {
      onOpenPaywall?.("Экспорт PNG");
      return;
    }

    setIsPaletteOpen(false);
    setIsResizeSheetOpen(false);
    setIsBackConfirmOpen(false);
    setExportProjectName(data?.name ?? "");
    setPngPreviewUrl(null);
    setColorsPreviewUrl(null);
    setIsGeneratingPreview(true);
    setIsExportSheetOpen(true);

    const wmPrefs = readWatermarkPrefs();
    const wmEnabled = effectivePlan.canWatermark ? wmPrefs.enabled : true;
    const wmText = effectivePlan.canWatermark ? wmPrefs.text : "@skapova_studio";

    const token = ++previewTokenRef.current;
    try {
      const [preview, colorsPreview] = await Promise.all([
        canvasGridRef.current?.createPngPreview({
          watermark: wmEnabled,
          watermarkText: wmEnabled ? wmText : undefined,
          aspectRatio: "original",
        }),
        canvasGridRef.current?.createColorsPreview(),
      ]);
      if (token === previewTokenRef.current) {
        setPngPreviewUrl(preview ?? null);
        setColorsPreviewUrl(colorsPreview ?? null);
      }
    } finally {
      if (token === previewTokenRef.current) setIsGeneratingPreview(false);
    }
  };

  const handleCloseExportSheet = () => {
    previewTokenRef.current++;
    setIsExportSheetOpen(false);
    setPngPreviewUrl(null);
    setColorsPreviewUrl(null);
    setIsGeneratingPreview(false);
  };

  const handleRegeneratePreview = (watermarkEnabled: boolean, watermarkText: string, aspectRatio: ExportAspectRatio) => {
    if (previewDebounceRef.current !== null) window.clearTimeout(previewDebounceRef.current);
    setIsGeneratingPreview(true);
    const token = ++previewTokenRef.current;
    previewDebounceRef.current = window.setTimeout(async () => {
      previewDebounceRef.current = null;
      if (token !== previewTokenRef.current) return;
      try {
        const preview = await canvasGridRef.current?.createPngPreview({
          watermark: watermarkEnabled,
          watermarkText: watermarkEnabled ? watermarkText : undefined,
          aspectRatio,
        });
        if (token === previewTokenRef.current) setPngPreviewUrl(preview ?? null);
      } finally {
        if (token === previewTokenRef.current) setIsGeneratingPreview(false);
      }
    }, 120);
  };

  const executePngExport = async (watermark: boolean, watermarkText: string, aspectRatio: ExportAspectRatio, includeColors: boolean): Promise<void> => {
    const nextName = exportProjectName.trim() || data?.name || "beadly-project";

    if (!data) {
      await canvasGridRef.current?.exportPng(nextName, undefined, { watermark, watermarkText: watermark ? watermarkText : undefined, aspectRatio, includeColors });
      return;
    }

    const currentShapeSnapshot = getCurrentShapeSnapshot();
    const exportProject = {
      ...data, name: nextName, cells: currentCells, backgroundColor, backgroundImageUrl,
      canvasPaddingPercent, textLayers,
      shapeLayers: currentShapeSnapshot.layers,
      activeShapeLayerId: currentShapeSnapshot.activeLayerId,
    } as GridProject & GridSeed;

    safeSaveProject(exportProject);
    lastSavedCellsRef.current = currentCells;
    lastSavedBackgroundColorRef.current = backgroundColor;
    lastSavedBackgroundImageUrlRef.current = backgroundImageUrl;
    lastSavedCanvasPaddingPercentRef.current = canvasPaddingPercent;
    lastSavedTextLayersRef.current = textLayers;
    lastSavedShapeLayersRef.current = currentShapeSnapshot.layers;
    lastSavedActiveShapeLayerIdRef.current = currentShapeSnapshot.activeLayerId;
    setShapeLayers(currentShapeSnapshot.layers);
    setActiveShapeLayerId(currentShapeSnapshot.activeLayerId);
    setHasShapeLayer(currentShapeSnapshot.layers.length > 0);

    await canvasGridRef.current?.exportPng(nextName, exportProject, { watermark, watermarkText: watermark ? watermarkText : undefined, aspectRatio, includeColors });
  };

  const handleSharePng = async (watermarkEnabled: boolean, watermarkText: string, aspectRatio: ExportAspectRatio, includeColors: boolean): Promise<void> => {
    await executePngExport(watermarkEnabled, watermarkText, aspectRatio, includeColors);
  };

  const handleOpenResizeSheet = () => {
    if (!data) return;

    // Изменение размера заблокировано для free и starter
    if (!effectivePlan.canResize) {
      onOpenPaywall?.("Изменение размера схемы");
      return;
    }

    setIsPaletteOpen(false);

    setIsBackConfirmOpen(false);
    setIsResizeSheetOpen(true);
  };

  const handleCloseResizeSheet = () => {
    setIsResizeSheetOpen(false);
  };


  const gridSizeLabel = `${data?.width ?? 10}×${data?.height ?? 10}`;

  const paletteColor = drawingColor;
  const paletteInputColor = paletteColor === "transparent" ? DEFAULT_BACKGROUND_COLOR : paletteColor;

  return (
    <div style={root}>
      <div
        className="app-fixed"
        style={{
          ...container,
          padding: isMobileScreen
            ? MOBILE_SCREEN_PADDING
            : 16,
        }}
      >
        <div style={topBar}>
          <button type="button" style={backButton} onClick={handleBack}>
            ←
          </button>
          <button
            type="button"
            style={{ ...historyButton, opacity: canUndo ? 1 : 0.3 }}
            onClick={() => canvasGridRef.current?.undo()}
            disabled={!canUndo}
            aria-label="Отменить"
          >
            ↺
          </button>
          <button
            type="button"
            style={{ ...historyButton, opacity: canRedo ? 1 : 0.3 }}
            onClick={() => canvasGridRef.current?.redo()}
            disabled={!canRedo}
            aria-label="Повторить"
          >
            ↻
          </button>

          {isViewOnly ? (
            <div style={viewOnlyBadge}>👁 Просмотр</div>
          ) : (
            <button
              type="button"
              style={{
                ...gridSizeButton,
                opacity: effectivePlan.canResize ? 1 : 0.55,
              }}
              onClick={handleOpenResizeSheet}
            >
              {gridSizeLabel}
            </button>
          )}

          <button
            type="button"
            style={{ ...exportButton, opacity: isViewOnly ? 0.45 : 1 }}
            onClick={handleOpenExportSheet}
          >
            {isViewOnly ? "🔒" : "Экспорт"}
          </button>
        </div>

        <div style={canvasWrapper}>
          <div style={canvas}>
            <CanvasGrid
              ref={canvasGridRef}
              tool={tool}
              width={data?.width ?? 10}
              height={data?.height ?? 10}
              activeColor={drawingColor}
              backgroundColor={backgroundColor}
              backgroundImageUrl={backgroundImageUrl}
              canvasPaddingPercent={canvasPaddingPercent}
              toolSize={toolSize}
              rulerVisible={isRulerVisible}
              rulerLocked={isRulerLocked}
              rulerSize={rulerSize}
              rulerTextVisible={isRulerTextVisible}
              shapeType={shapeType}
              textLayers={textLayers}
              activeTextLayerId={activeTextLayer.id}
              textSlotId={activeTextLayer.id}
              textValue={activeTextLayer.value}
              textSize={activeTextLayer.size}
              textStyle={activeTextLayer.style}
              textInteractionMode={textInteractionMode}
              shapeInteractionMode={shapeInteractionMode}
              shapeLayers={shapeLayers}
              activeShapeLayerId={activeShapeLayerId}
              cells={currentCells}
              onCellsChange={handleCellsChange}
              onUndoStateChange={(u, r) => { setCanUndo(u); setCanRedo(r); }}
              onTextLayerSelect={(layerId: number) => {
                setActiveTextLayerId(layerId);
              }}
              onTextLayerChange={updateTextLayerById}
              onTextCanvasPointerDown={(layerId: number | null) => {
                if (layerId !== null) {
                  setActiveTextLayerId(layerId);
                }

                setIsTextPanelVisible(false);
                setTextPanelMode("text");
              }}
              onShapeTypeChange={setShapeType}
              onShapeLayerChange={setHasShapeLayer}
              onShapeLayersChange={(nextShapeLayers: ShapeLayer[], nextActiveShapeLayerId: string | null) => {
                setShapeLayers(nextShapeLayers);
                setActiveShapeLayerId(nextActiveShapeLayerId);
                setHasShapeLayer(nextShapeLayers.length > 0);
                hasEditedInSessionRef.current = true;
              }}
              onShapeLayerSelect={(layerId: string | null) => {
                setActiveShapeLayerId(layerId);
              }}
              onError={(message: string) => {
                setGridAlert({
                  title: "Не удалось выполнить действие",
                  message,
                });
              }}
            />

            {isPaletteOpen && (
              <div
                ref={paletteRef}
                style={paletteWrap}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={paletteHeader}>
                  <button
                    type="button"
                    style={paletteCloseButton}
                    onClick={() => setIsPaletteOpen(false)}
                    aria-label="Закрыть палитру"
                  >
                    <span style={paletteCloseIconLineOne} />
                    <span style={paletteCloseIconLineTwo} />
                  </button>

                  <div style={paletteTitle}>Цвет</div>

                  <div style={paletteHeaderSpacer} />
                </div>

                <div style={paletteCurrentRow}>
                  <div style={paletteCurrentInfo}>
                    <div
                      style={{
                        ...palettePreviewLarge,
                        background: paletteColor === "transparent" ? "rgba(255,255,255,0.12)" : paletteColor,
                      }}
                    />

                    <div style={paletteHexLabel}>{paletteColor === "transparent" ? "БЕЗ ФОНА" : paletteColor.toUpperCase()}</div>
                  </div>

                  <label style={customColorButton}>
                    Свой
                    <input
                      type="color"
                      value={paletteInputColor}
                      onChange={(event) => handleSelectColor(event.target.value)}
                      style={customColorInput}
                      aria-label="Выбрать свой цвет"
                    />
                  </label>
                </div>

                <div style={recentColorsBlock}>
                  <div style={recentColorsTitle}>Последние цвета</div>

                  <div style={recentColorsGrid}>
                    {recentColors.map((color) => {
                      const normalizedColor = normalizeColor(color);
                      const isActive = normalizedColor === normalizeColor(paletteColor);
                      const isLightColor =
                        normalizedColor === "#ffffff" ||
                        normalizedColor === "#f2f2f7" ||
                        normalizedColor === "#ffcc00";

                      return (
                        <button
                          key={normalizedColor}
                          type="button"
                          onClick={() => handleSelectColor(normalizedColor)}
                          style={{
                            ...paletteButton,
                            background: normalizedColor,
                            border: isActive
                              ? "2px solid #d9825f"
                              : isLightColor
                                ? "1px solid rgba(0,0,0,0.18)"
                                : "1px solid rgba(255,255,255,0.14)",
                            boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                          }}
                          aria-label={`Выбрать цвет ${normalizedColor}`}
                        >
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tool === "text" && isTextPanelVisible && (
              <div
                style={instaTextOnlyPanel}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={instaTextControls}>
                  {textPanelMode === "size" ? (
                    <div style={instaSizeControls}>
                      <div style={instaSizeHeader}>
                        <span style={instaSizeTitle}>Размер текста</span>
                        <span style={instaSizeValue}>{activeTextLayer.size}</span>
                      </div>
                      <input
                        type="range"
                        min={14}
                        max={92}
                        value={activeTextLayer.size}
                        onInput={(event) =>
                          updateActiveTextLayer({
                            size: Number((event.currentTarget as HTMLInputElement).value),
                          })
                        }
                        onChange={(event) =>
                          updateActiveTextLayer({
                            size: Number((event.currentTarget as HTMLInputElement).value),
                          })
                        }
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          event.currentTarget.setPointerCapture?.(event.pointerId);
                        }}
                        onPointerMove={(event) => event.stopPropagation()}
                        onPointerUp={(event) => {
                          event.stopPropagation();
                          event.currentTarget.releasePointerCapture?.(event.pointerId);
                        }}
                        onTouchStart={(event) => event.stopPropagation()}
                        onTouchMove={(event) => event.stopPropagation()}
                        style={instaSizeRange}
                        aria-label="Размер текста"
                      />
                    </div>
                  ) : (
                    <textarea
                      key={activeTextLayer.id}
                      ref={textInputRef}
                      value={activeTextLayer.value}
                      onInput={(event) => handleActiveTextValueChange(event.currentTarget.value)}
                      onChange={(event) => handleActiveTextValueChange(event.currentTarget.value)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerMove={(event) => event.stopPropagation()}
                      onPointerUp={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                      onTouchMove={(event) => { event.stopPropagation(); }}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.currentTarget.focus();
                      }}
                      placeholder="Напиши текст"
                      style={instaTextInput}
                      maxLength={240}
                      rows={4}
                      autoFocus
                    />
                  )}
                </div>
              </div>
            )}

            <BottomToolbar
              active={tool}
              activeColor={drawingColor}
              toolSize={toolSize}
              onToolSizeChange={setToolSize}
              onChange={handleToolChange}
              onOpenPalette={handleOpenPalette}
              rulerVisible={isRulerVisible}
              rulerLocked={isRulerLocked}
              rulerSize={rulerSize}
              rulerTextVisible={isRulerTextVisible}
              onToggleRulerVisible={handleToggleRulerVisible}
              onToggleRulerLocked={handleToggleRulerLocked}
              onRulerSizeChange={setRulerSize}
              onToggleRulerTextVisible={handleToggleRulerTextVisible}
              shapeType={shapeType}
              onShapeTypeChange={setShapeType}
              onAddShapeLayer={handleAddShapeLayer}
              hasShapeLayer={hasShapeLayer}
              onClearShape={handleClearShape}
              onAddTextLayer={handleAddTextLayer}
              onRemoveTextLayer={handleRemoveTextLayer}
              hasTextLayer={Boolean(activeTextLayer.value.trim())}
              textSize={activeTextLayer.size}
              textPanelVisible={isTextPanelVisible}
              textPanelMode={textPanelMode}
              textOverlayOpen={isTextPanelVisible}
              onCloseTextOverlay={() => {
                setIsTextPanelVisible(false);
                setTextPanelMode("text");
              }}
              onTextSizeChange={(nextSize) => {
                updateActiveTextLayer({ size: nextSize });
                setTextInteractionMode("edit");
              }}
              textInteractionMode={textInteractionMode}
              onTextInteractionModeChange={handleTextInteractionModeChange}
              shapeInteractionMode={shapeInteractionMode}
              onShapeInteractionModeChange={setShapeInteractionMode}
              shapeFillMode={activeShapeFillMode}
              onShapeFillModeChange={updateActiveShapeFillMode}
              onToggleTextPanel={handleToggleTextPanel}
              onImportBackgroundImage={handleImportBackgroundImage}
              onResetBackground={handleResetBackground}
              canvasPaddingPercent={canvasPaddingPercent}
              onCanvasPaddingPercentChange={handleCanvasPaddingPercentChange}
              isViewOnly={isViewOnly}
              onOpenPaywall={onOpenPaywall}
            />
          </div>
        </div>
      </div>

      {isResizeSheetOpen && data && (
        <ResizeProjectScreen
          currentWidth={data.width}
          currentHeight={data.height}
          currentCells={currentCells}
          backgroundColor={backgroundColor}
          backgroundImageUrl={backgroundImageUrl}
          onClose={handleCloseResizeSheet}
          onApply={(w, h, hA, vA) => {
            const resized = resizeCells(
              currentCells, data.width, data.height, w, h, hA, vA,
            );
            const snap = getCurrentShapeSnapshot();
            const next = {
              ...data, width: w, height: h, cells: resized,
              backgroundColor, backgroundImageUrl, canvasPaddingPercent,
              textLayers,
              shapeLayers: snap.layers,
              activeShapeLayerId: snap.activeLayerId,
            } as GridProject;
            if (autosaveTimeoutRef.current !== null) {
              window.clearTimeout(autosaveTimeoutRef.current);
              autosaveTimeoutRef.current = null;
            }
            hasEditedInSessionRef.current = true;
            setCurrentCells(resized);
            setShapeLayers(snap.layers);
            setActiveShapeLayerId(snap.activeLayerId);
            setHasShapeLayer(snap.layers.length > 0);
            lastSavedCellsRef.current = resized;
            lastSavedShapeLayersRef.current = snap.layers;
            lastSavedActiveShapeLayerIdRef.current = snap.activeLayerId;
            safeSaveProject(next);
            setIsResizeSheetOpen(false);
          }}
        />
      )}

      {isExportSheetOpen && (
        <ExportScreen
          pngPreviewUrl={pngPreviewUrl}
          colorsPreviewUrl={colorsPreviewUrl}
          isGeneratingPreview={isGeneratingPreview}
          onShare={handleSharePng}
          onRegeneratePreview={handleRegeneratePreview}
          onOpenPaywall={onOpenPaywall}
          onClose={handleCloseExportSheet}
        />
      )}

      {isBackConfirmOpen && (
        <div
          style={backConfirmOverlay}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <div
            style={backConfirmCard}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div style={backConfirmHeader}>
              <button
                type="button"
                style={backConfirmCloseButton}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleBackCancel();
                }}
              >
                ✕
              </button>

              <div style={backConfirmTitle}>Сохранить изменения?</div>

              <div style={backConfirmHeaderSpacer} />
            </div>

            <div style={backConfirmText}>
              В проекте были изменения. Сохранить их перед выходом?
            </div>

            <div style={backConfirmActions}>
              <button
                type="button"
                style={backConfirmSecondaryButton}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleBackWithoutSave();
                }}
              >
                Не сохранять
              </button>

              <button
                type="button"
                style={backConfirmPrimaryButton}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleBackWithSave();
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      <AppAlert
        open={Boolean(gridAlert)}
        theme={getDocumentTheme()}
        variant="info"
        title={gridAlert?.title ?? "Ошибка"}
        message={gridAlert?.message}
        confirmText="Понятно"
        onConfirm={() => setGridAlert(null)}
        onCancel={() => setGridAlert(null)}
      />


    </div>
  );
};

export default GridScreen;

const root: React.CSSProperties = {
  width: "100%",
  // Явно берём высоту от CSS-переменной — надёжнее чем height:100% по цепочке
  height: "var(--app-height, 100dvh)",
  maxHeight: "var(--app-height, 100dvh)",
  background: "var(--bg)",
  overflow: "hidden",
};

const container: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  overflow: "hidden",
  touchAction: "none",
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
  background: ds.color.surfaceStrong,
  borderRadius: ds.radius.xl,
  padding: "10px 12px",
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
};

const historyButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.sm,
  fontSize: 16,
  flexShrink: 0,
};

const backButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 48,
  height: 48,
  borderRadius: ds.radius.md,
  fontSize: 20,
  flexShrink: 0,
};

const viewOnlyBadge: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  color: ds.color.textSecondary,
  letterSpacing: 0.1,
};

const gridSizeButton: React.CSSProperties = {
  ...ui.iconButton,
  minWidth: 58,
  height: 40,
  padding: "0 12px",
  borderRadius: ds.radius.sm,
  fontSize: 13,
  fontWeight: 850,
  lineHeight: 1,
  flexShrink: 0,
};

const exportButton: React.CSSProperties = {
  ...ui.primaryButton,
  height: 40,
  padding: "0 16px",
  borderRadius: ds.radius.lg,
  fontSize: 13,
  fontWeight: 700,
  boxShadow: "none",
  flexShrink: 0,
  marginLeft: "auto",
};

const canvasWrapper: React.CSSProperties = {
  flex: 1,
  marginTop: 16,
  minHeight: 0, // позволяет flex-child уменьшаться ниже content-size
};

const canvas: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  // Резервируем место под тулбар: 78px высота + 12px отступ + safe-bottom + 12px запас.
  // CanvasGrid измеряет себя через ResizeObserver и видит только область выше тулбара.
  // max() гарантирует что env(safe-area-inset-bottom) всегда учтён даже если TG-переменная = 0.
  paddingBottom: "calc(max(var(--app-tg-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)) + 102px)",
  background: "var(--card-bg)",
  borderRadius: 24,
  border: `1px solid ${ds.color.border}`,
};



const instaPanel: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  // --app-keyboard-offset поднимает панель над клавиатурой когда она открыта
  bottom: "calc(max(var(--app-tg-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)) + var(--app-keyboard-offset, 0px) + 104px)",
  zIndex: 45,
  width: "min(92vw, 370px)",
  transform: "translateX(-50%)",
  padding: 12,
  borderRadius: 28,
  background: ds.color.surfaceElevated,
  border: `1px solid ${ds.color.borderStrong}`,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.34)",
  boxSizing: "border-box",
  pointerEvents: "auto",
};

const instaTextOnlyPanel: React.CSSProperties = {
  ...instaPanel,
  bottom: "calc(max(var(--app-tg-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)) + var(--app-keyboard-offset, 0px) + 122px)",
  zIndex: 60,
  padding: 0,
  background: "transparent",
  border: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  boxShadow: "none",
};








const instaTextControls: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const instaTextInput: React.CSSProperties = {
  width: "100%",
  minHeight: 82,
  maxHeight: 132,
  padding: "12px 14px",
  border: `1px solid ${ds.color.borderStrong}`,
  borderRadius: 20,
  outline: "none",
  background: ds.color.surfaceSoft,
  color: ds.color.textPrimary,
  fontSize: 17,
  lineHeight: 1.28,
  fontWeight: 850,
  boxSizing: "border-box",
  resize: "none",
  overflow: "auto",
  touchAction: "auto",
  userSelect: "text",
  WebkitUserSelect: "text",
  caretColor: "#ffffff",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  boxShadow: "none",
};

const instaSizeControls: React.CSSProperties = {
  width: "100%",
  minHeight: 86,
  padding: "13px 15px 12px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  background: ds.color.surfaceElevated,
  border: `1px solid ${ds.color.borderStrong}`,
  borderRadius: 24,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
};

const instaSizeHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const instaSizeTitle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 12,
  fontWeight: 900,
};

const instaSizeValue: React.CSSProperties = {
  minWidth: 42,
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: ds.color.surfaceSoft,
  color: ds.color.textPrimary,
  fontSize: 14,
  fontWeight: 950,
};

const instaSizeRange: React.CSSProperties = {
  width: "100%",
  height: 28,
  padding: "0 2px",
  accentColor: "#a78bfa",
  background: "var(--tab-active-bg)",
  borderRadius: 999,
  border: `1px solid ${ds.color.borderStrong}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
  touchAction: "pan-x",
  cursor: "pointer",
  WebkitUserSelect: "none",
  userSelect: "none",
};



const paletteWrap: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  right: "auto",
  bottom: "calc(max(var(--app-tg-safe-bottom, 0px), env(safe-area-inset-bottom, 0px)) + 102px)",
  zIndex: 50,
  width: "min(92vw, 336px)",
  maxWidth: 336,
  transform: "translateX(-50%)",
  padding: 14,
  borderRadius: 26,
  background: ds.color.surfaceElevated,
  border: `1px solid ${ds.color.borderStrong}`,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.32)",
  pointerEvents: "auto",
  boxSizing: "border-box",
};

const paletteHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px 1fr 38px",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
};

const paletteTitle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: "-0.02em",
  textAlign: "center",
};

const paletteCloseButton: React.CSSProperties = {
  position: "relative",
  width: 38,
  height: 38,
  borderRadius: 16,
  border: `1px solid ${ds.color.borderStrong}`,
  background: ds.color.iconButtonBg,
  color: "rgba(255,255,255,0.9)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  flexShrink: 0,
};

const paletteCloseIconLineOne: React.CSSProperties = {
  position: "absolute",
  width: 15,
  height: 2,
  borderRadius: 999,
  background: "currentColor",
  transform: "rotate(45deg)",
};

const paletteCloseIconLineTwo: React.CSSProperties = {
  position: "absolute",
  width: 15,
  height: 2,
  borderRadius: 999,
  background: "currentColor",
  transform: "rotate(-45deg)",
};

const paletteHeaderSpacer: React.CSSProperties = {
  width: 38,
  height: 38,
};

const paletteCurrentRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 10,
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
  marginBottom: 12,
};

const paletteCurrentInfo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const palettePreviewLarge: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 16,
  border: "2px solid rgba(255,255,255,0.26)",
  boxShadow: "0 8px 18px rgba(0,0,0,0.2)",
  flexShrink: 0,
};

const paletteHexLabel: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.35,
};

const customColorButton: React.CSSProperties = {
  position: "relative",
  height: 42,
  minWidth: 72,
  padding: "0 14px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "linear-gradient(135deg, rgba(217,130,95,0.96), rgba(184,93,106,0.96))",
  color: ds.color.textPrimary,
  fontSize: 13,
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  WebkitTapHighlightColor: "transparent",
  flexShrink: 0,
};

const customColorInput: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
};

const recentColorsBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const recentColorsTitle: React.CSSProperties = {
  color: ds.color.textQuaternary,
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  paddingLeft: 2,
};

const recentColorsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 44px)",
  justifyContent: "space-between",
  gap: 8,
};

const paletteButton: React.CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: 999,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "box-shadow 160ms ease, border 160ms ease",
  WebkitTapHighlightColor: "transparent",
};


const backConfirmOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
  pointerEvents: "auto",
  touchAction: "auto",
};

const backConfirmCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  padding: 18,
  borderRadius: 24,
  background: ds.color.surfaceStrong,
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
  pointerEvents: "auto",
  touchAction: "auto",
};

const backConfirmHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px 1fr 40px",
  alignItems: "center",
  gap: 8,
};

const backConfirmCloseButton: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: ds.radius.sm,
  border: `1px solid ${ds.color.border}`,
  background: ds.color.iconButtonBg,
  color: ds.color.textPrimary,
  fontSize: 18,
  fontWeight: ds.weight.semibold,
  padding: 0,
  cursor: "pointer",
  pointerEvents: "auto",
  touchAction: "manipulation",
};

const backConfirmHeaderSpacer: React.CSSProperties = {
  width: 40,
  height: 40,
};

const backConfirmTitle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: 17,
  fontWeight: 800,
  textAlign: "center",
};

const backConfirmText: React.CSSProperties = {
  marginTop: 10,
  color: ds.color.textTertiary,
  fontSize: 14,
  lineHeight: 1.45,
  textAlign: "center",
};

const backConfirmActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 18,
};

const backConfirmSecondaryButton: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: `1px solid ${ds.color.border}`,
  background: ds.color.iconButtonBg,
  color: ds.color.textPrimary,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  pointerEvents: "auto",
  touchAction: "manipulation",
};

const backConfirmPrimaryButton: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: "none",
  background: ds.color.primaryButtonBg,
  color: ds.color.primaryButtonText,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "none",
  pointerEvents: "auto",
  touchAction: "manipulation",
};

// ── Защитный экран (показывается при уходе в фон) ─────────────────────────────
