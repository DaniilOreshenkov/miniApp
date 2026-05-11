import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import CanvasGrid, { type CanvasGridHandle } from "../components/CanvasGrid";
import BottomToolbar from "../components/BottomToolbar";
import CreateProjectSheet from "../components/CreateProjectSheet";
import type { GridData, GridProject } from "../App";

interface Props {
  onBack?: () => void;
  data: GridData | null;
  onSave: (project: GridProject) => void;
}

type Tool = "move" | "brush" | "erase" | "add" | "deactivate" | "ruler" | "shape" | "text" | "background";
type ShapeType = "oval" | "circle" | "square" | "triangle" | "cross" | "arrow" | "doubleArrow";
type TextStyle = "plain" | "bubble" | "shadow";
type TextPanelMode = "text" | "size";
type TextInteractionMode = "edit" | "move" | "rotate";
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

  try {
    tg.requestFullscreen?.();
  } catch {
    // Telegram может не дать fullscreen на некоторых платформах — это нормально.
  }
};


const MOBILE_TOP_PADDING = 110;
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;

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

const getProjectCanvasPaddingPercent = (_project: GridProject | null): CanvasPaddingPercent => {
  return DEFAULT_CANVAS_PADDING_PERCENT;
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

const sanitizeNumericInput = (value: string) => value.replace(/\D/g, "");

const isGridValueValid = (value: string) => {
  if (value.trim() === "") return false;

  const numericValue = Number(value);

  return (
    Number.isInteger(numericValue) &&
    numericValue >= MIN_GRID_SIZE &&
    numericValue <= MAX_GRID_SIZE
  );
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

const resizeCells = (
  oldCells: string[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
) => {
  const nextCells = createFallbackCells(newWidth, newHeight);

  const oldRowCount = getRowCount(oldHeight);
  const newRowCount = getRowCount(newHeight);
  const rowsToCopy = Math.min(oldRowCount, newRowCount);

  let oldIndex = 0;
  let newIndex = 0;

  for (let rowIndex = 0; rowIndex < rowsToCopy; rowIndex += 1) {
    const oldRowLength = getRowLength(oldWidth, rowIndex);
    const newRowLength = getRowLength(newWidth, rowIndex);
    const cellsToCopy = Math.min(oldRowLength, newRowLength);

    for (let cellIndex = 0; cellIndex < cellsToCopy; cellIndex += 1) {
      const oldCell = oldCells[oldIndex + cellIndex];

      if (oldCell) {
        nextCells[newIndex + cellIndex] = oldCell;
      }
    }

    oldIndex += oldRowLength;
    newIndex += newRowLength;
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

const GridScreen: React.FC<Props> = ({ onBack, data, onSave }) => {
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
  const [activeTextLayerId, setActiveTextLayerId] = useState(1);
  const [textLayers, setTextLayers] = useState<TextLayer[]>(() => getProjectTextLayers(data));
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isTextPanelVisible, setIsTextPanelVisible] = useState(false);
  const [textPanelMode, setTextPanelMode] = useState<TextPanelMode>("text");
  const [textInteractionMode, setTextInteractionMode] = useState<TextInteractionMode>("edit");

  const nextTextLayerIdRef = useRef(1);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTextLayerIdRef = useRef(activeTextLayerId);
  const activeTextLayer =
    textLayers.find((layer) => layer.id === activeTextLayerId) ?? textLayers[0] ?? createTextLayer(1);
  const drawingColor =
    tool === "text"
      ? activeTextLayer.color
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
      window.alert("Картинка импортировалась, но проект не удалось сохранить. Попробуй фото поменьше.");
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
    if (nextTool === "text") {
      setTool("text");
      setIsTextPanelVisible(false);
      setTextPanelMode("text");
      setTextInteractionMode("edit");
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
  const [isExportSheetVisible, setIsExportSheetVisible] = useState(false);
  const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [exportProjectName, setExportProjectName] = useState("");
  const [isResizeSheetOpen, setIsResizeSheetOpen] = useState(false);
  const [resizeWidth, setResizeWidth] = useState("10");
  const [resizeHeight, setResizeHeight] = useState("10");
  const [isBackConfirmOpen, setIsBackConfirmOpen] = useState(false);

  const canvasGridRef = useRef<CanvasGridHandle | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
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
  const autosaveTimeoutRef = useRef<number | null>(null);

  const isResizeWidthValid = isGridValueValid(resizeWidth);
  const isResizeHeightValid = isGridValueValid(resizeHeight);
  const isResizeDisabled = !data || !isResizeWidthValid || !isResizeHeightValid;

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
    lastSavedTextLayersRef.current = nextTextLayers;
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

    setResizeWidth(String(data.width));
    setResizeHeight(String(data.height));
    setExportProjectName(data.name ?? "");
  }, [data]);

  useEffect(() => {
    if (!data) return;

    const isChanged =
      !areArraysEqual(currentCells, lastSavedCellsRef.current) ||
      backgroundColor !== lastSavedBackgroundColorRef.current ||
      backgroundImageUrl !== lastSavedBackgroundImageUrlRef.current ||
      canvasPaddingPercent !== lastSavedCanvasPaddingPercentRef.current ||
      !areTextLayersEqual(textLayers, lastSavedTextLayersRef.current);

    if (!isChanged) return;

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      const nextProject = {
        ...data,
        cells: currentCells,
        backgroundColor,
        backgroundImageUrl,
        canvasPaddingPercent,
        textLayers,
      } as GridProject;

      if (!safeSaveProject(nextProject)) return;

      lastSavedCellsRef.current = currentCells;
      lastSavedBackgroundColorRef.current = backgroundColor;
      lastSavedBackgroundImageUrlRef.current = backgroundImageUrl;
      lastSavedCanvasPaddingPercentRef.current = canvasPaddingPercent;
      lastSavedTextLayersRef.current = textLayers;
      autosaveTimeoutRef.current = null;
    }, 700);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [backgroundColor, backgroundImageUrl, canvasPaddingPercent, currentCells, data, onSave, textLayers]);

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isExportSheetOpen && !isResizeSheetOpen && !isBackConfirmOpen) return;

    lockTelegramViewport();

    const intervalId = window.setInterval(() => {
      lockTelegramViewport();
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isExportSheetOpen, isResizeSheetOpen, isBackConfirmOpen]);

  const saveCurrentProject = () => {
    if (!data) return;

    const nextProject = {
      ...data,
      cells: currentCells,
      backgroundColor,
      backgroundImageUrl,
      canvasPaddingPercent,
      textLayers,
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
  };

  const handleBack = () => {
    if (!hasEditedInSessionRef.current) {
      onBack?.();
      return;
    }

    setIsPaletteOpen(false);
    setIsExportSheetOpen(false);
    setIsExportSheetVisible(false);
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
      setBackgroundColor(originalBackgroundColor);
      setBackgroundImageUrl(originalBackgroundImageUrl);
      setCanvasPaddingPercent(originalCanvasPaddingPercent);
      setTextLayers(originalTextLayers);
      setActiveTextLayerId(originalTextLayers[originalTextLayers.length - 1]?.id ?? 1);
      lastSavedCellsRef.current = [...originalProject.cells];
      lastSavedBackgroundColorRef.current = originalBackgroundColor;
      lastSavedBackgroundImageUrlRef.current = originalBackgroundImageUrl;
      lastSavedCanvasPaddingPercentRef.current = originalCanvasPaddingPercent;
      lastSavedTextLayersRef.current = originalTextLayers;
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

  const handleApplyShape = () => {
    canvasGridRef.current?.applyCurrentShape();
  };

  const handleClearShape = () => {
    canvasGridRef.current?.clearCurrentShape();
  };

  const handleShapeTypeChange = (nextShapeType: ShapeType) => {
    setShapeType(nextShapeType);
    setTool("shape");
  };

  const handleOverlayColorChange = (color: string) => {
    const normalizedColor = normalizeColor(color);

    if (tool === "text") {
      updateActiveTextLayer({ color: normalizedColor });
    } else if (tool === "background") {
      setBackgroundColor(normalizedColor);
      setBackgroundImageUrl(null);
      hasEditedInSessionRef.current = true;
    } else {
      setActiveColor(normalizedColor);
    }

    rememberColor(normalizedColor);
  };

  const handleOpenPalette = () => {
    setIsExportSheetOpen(false);
    setIsExportSheetVisible(false);
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

      window.alert(message);
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

  const handleOpenExportSheet = async () => {
    if (isGeneratingPreview) return;

    lockTelegramViewport();
    setIsPaletteOpen(false);
    setIsResizeSheetOpen(false);
    setIsBackConfirmOpen(false);
    setExportProjectName(data?.name ?? "");
    setIsExportSheetOpen(true);
    window.requestAnimationFrame(() => {
      setIsExportSheetVisible(true);
    });
    setPngPreviewUrl(null);
    setIsGeneratingPreview(true);

    try {
      const preview = await canvasGridRef.current?.createPngPreview();
      setPngPreviewUrl(preview ?? null);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleCloseExportSheet = () => {
    setIsExportSheetVisible(false);

    window.setTimeout(() => {
      setIsExportSheetOpen(false);
      setPngPreviewUrl(null);
      setIsGeneratingPreview(false);
    }, 260);
  };

  const handleDownloadPng = () => {
    const trimmedName = exportProjectName.trim();
    const nextName = trimmedName.length > 0 ? trimmedName : "beadly-project";

    if (data && trimmedName.length > 0 && trimmedName !== data.name) {
      const renamedProject = {
        ...data,
        name: trimmedName,
        cells: currentCells,
        backgroundColor,
        backgroundImageUrl,
        canvasPaddingPercent,
      } as GridProject;

      safeSaveProject(renamedProject);
    }

    canvasGridRef.current?.exportPng(nextName);
  };

  const handleOpenResizeSheet = () => {
    if (!data) return;

    setIsPaletteOpen(false);
    setIsExportSheetOpen(false);
    setIsExportSheetVisible(false);
    setIsBackConfirmOpen(false);
    setResizeWidth(String(data.width));
    setResizeHeight(String(data.height));
    setIsResizeSheetOpen(true);
  };

  const handleCloseResizeSheet = () => {
    setIsResizeSheetOpen(false);
  };

  const handleResizeWidthChange = (value: string) => {
    setResizeWidth(sanitizeNumericInput(value));
  };

  const handleResizeHeightChange = (value: string) => {
    setResizeHeight(sanitizeNumericInput(value));
  };

  const handleResizeWidthBlur = () => {
    if (resizeWidth.trim() === "") {
      setResizeWidth(String(data?.width ?? 10));
    }
  };

  const handleResizeHeightBlur = () => {
    if (resizeHeight.trim() === "") {
      setResizeHeight(String(data?.height ?? 10));
    }
  };

  const handleApplyResize = () => {
    if (!data || isResizeDisabled) return;

    const nextWidth = Number(resizeWidth);
    const nextHeight = Number(resizeHeight);

    const resizedCells = resizeCells(
      currentCells,
      data.width,
      data.height,
      nextWidth,
      nextHeight,
    );

    const nextProject = {
      ...data,
      width: nextWidth,
      height: nextHeight,
      cells: resizedCells,
      backgroundColor,
      backgroundImageUrl,
      canvasPaddingPercent,
      textLayers,
    } as GridProject;

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    hasEditedInSessionRef.current = true;
    setCurrentCells(resizedCells);
    lastSavedCellsRef.current = resizedCells;
    if (!safeSaveProject(nextProject)) return;

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
            ? `${MOBILE_TOP_PADDING}px 16px 16px`
            : 16,
        }}
      >
        <div style={topBar}>
          <button type="button" style={iconButton} onClick={handleBack}>
            ←
          </button>

          <button
            type="button"
            style={gridSizeButton}
            onClick={handleOpenResizeSheet}
          >
            {gridSizeLabel}
          </button>

          <button
            type="button"
            style={exportButton}
            onClick={handleOpenExportSheet}
          >
            Экспорт
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
              cells={currentCells}
              onCellsChange={handleCellsChange}
              onTextLayerSelect={(layerId) => {
                setActiveTextLayerId(layerId);
              }}
              onTextLayerChange={updateTextLayerById}
              onTextCanvasPointerDown={(layerId) => {
                if (layerId !== null) {
                  setActiveTextLayerId(layerId);
                }

                setIsTextPanelVisible(false);
                setTextPanelMode("text");
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

            {(tool === "shape" || (tool === "text" && isTextPanelVisible)) && (
              <div
                style={tool === "text" ? instaTextOnlyPanel : instaPanel}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {tool === "text" ? (
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
                        onMouseDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
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
                ) : (
                  <div style={instaShapeGrid}>
                    {[
                      ["oval", "Овал"],
                      ["circle", "Круг"],
                      ["square", "Квадрат"],
                      ["triangle", "Треуг."],
                      ["cross", "Крест"],
                      ["arrow", "→"],
                      ["doubleArrow", "↔"],
                    ].map(([value, label]) => {
                      const nextShapeType = value as ShapeType;
                      const isActive = shapeType === nextShapeType;

                      return (
                        <button
                          key={value}
                          type="button"
                          style={{
                            ...instaShapeButton,
                            ...(isActive ? instaShapeButtonActive : null),
                          }}
                          onClick={() => handleShapeTypeChange(nextShapeType)}
                        >
                          {label}
                        </button>
                      );
                    })}

                    <label style={instaShapeColorButton}>
                      <span
                        style={{
                          ...instaColorPreview,
                          background: activeColor,
                        }}
                      />
                      Цвет
                      <input
                        type="color"
                        value={activeColor}
                        onChange={(event) => handleOverlayColorChange(event.target.value)}
                        style={instaHiddenColorInput}
                        aria-label="Цвет фигуры"
                      />
                    </label>
                  </div>
                )}
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
              onShapeTypeChange={handleShapeTypeChange}
              onApplyShape={handleApplyShape}
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
              onToggleTextPanel={handleToggleTextPanel}
              onImportBackgroundImage={handleImportBackgroundImage}
              onResetBackground={handleResetBackground}
              canvasPaddingPercent={canvasPaddingPercent}
              onCanvasPaddingPercentChange={handleCanvasPaddingPercentChange}
            />
          </div>
        </div>
      </div>

      <CreateProjectSheet
        open={isResizeSheetOpen}
        title="Размер сетки"
        submitText="Изменить"
        hideProjectName
        projectName=""
        gridWidth={resizeWidth}
        gridHeight={resizeHeight}
        isProjectNameValid
        isWidthValid={isResizeWidthValid}
        isHeightValid={isResizeHeightValid}
        isCreateDisabled={isResizeDisabled}
        onClose={handleCloseResizeSheet}
        onCreate={handleApplyResize}
        onProjectNameChange={() => {}}
        onGridWidthChange={handleResizeWidthChange}
        onGridHeightChange={handleResizeHeightChange}
        onGridWidthBlur={handleResizeWidthBlur}
        onGridHeightBlur={handleResizeHeightBlur}
      />

      {isExportSheetOpen && (
        <div
          style={{
            ...sheetOverlay,
            background: isExportSheetVisible
              ? "rgba(0,0,0,0.46)"
              : "rgba(0,0,0,0)",
          }}
          onPointerDownCapture={(event) => {
            lockTelegramViewport();
            event.stopPropagation();
          }}
          onPointerMoveCapture={(event) => {
            lockTelegramViewport();
            event.preventDefault();
            event.stopPropagation();
          }}
          onTouchStartCapture={(event) => {
            lockTelegramViewport();
            event.stopPropagation();
          }}
          onTouchMoveCapture={(event) => {
            lockTelegramViewport();
            event.preventDefault();
            event.stopPropagation();
          }}
          onWheel={(event) => {
            event.stopPropagation();
          }}
          onClick={handleCloseExportSheet}
        >
          <div
            style={{
              ...sheet,
              transform: isExportSheetVisible
                ? "translateY(0)"
                : "translateY(105%)",
            }}
            onPointerDownCapture={(event) => {
              lockTelegramViewport();
              event.stopPropagation();
            }}
            onPointerMoveCapture={(event) => {
              lockTelegramViewport();
              event.preventDefault();
              event.stopPropagation();
            }}
            onTouchStartCapture={(event) => {
              lockTelegramViewport();
              event.stopPropagation();
            }}
            onTouchMoveCapture={(event) => {
              lockTelegramViewport();
              event.preventDefault();
              event.stopPropagation();
            }}
            onWheel={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sheetHandleWrap}>
              <div style={sheetHandle} />
            </div>

            <div style={sheetHeader}>
              <button
                type="button"
                style={sheetCloseButton}
                onClick={handleCloseExportSheet}
              >
                ✕
              </button>

              <div>
                <div style={sheetTitle}>PNG превью</div>
                <div style={sheetSubtitle}>
                  Проверь картинку перед скачиванием.
                </div>
              </div>

              <div style={sheetHeaderSpacer} />
            </div>

            <div style={exportNameWrap}>
              <div style={exportNameLabel}>Имя проекта</div>
              <input
                value={exportProjectName}
                onChange={(event) => setExportProjectName(event.target.value)}
                placeholder="Название проекта"
                style={exportNameInput}
              />
            </div>

            <div style={previewImageWrap}>
              {isGeneratingPreview ? (
                <div style={previewPlaceholder}>Готовлю PNG...</div>
              ) : pngPreviewUrl ? (
                <img src={pngPreviewUrl} alt="PNG preview" style={previewImage} />
              ) : (
                <div style={previewPlaceholder}>
                  PNG превью не удалось собрать
                </div>
              )}
            </div>

            <div style={previewActionsSingle}>
              <button
                type="button"
                style={{
                  ...previewPrimaryButton,
                  opacity: isGeneratingPreview ? 0.6 : 1,
                  cursor: isGeneratingPreview ? "default" : "pointer",
                }}
                onClick={handleDownloadPng}
                disabled={isGeneratingPreview}
              >
                Скачать PNG
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
};

export default GridScreen;

const root: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--bg)",
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
  background: "#1b1d22",
  borderRadius: ds.radius.xl,
  padding: "10px 12px",
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
};

const iconButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.sm,
  fontSize: 16,
  flexShrink: 0,
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
};

const canvas: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  background: "var(--card-bg)",
  borderRadius: 24,
  border: "1px solid rgba(0,0,0,0.04)",
};


const instaPanel: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 104,
  zIndex: 45,
  width: "min(92vw, 370px)",
  transform: "translateX(-50%)",
  padding: 12,
  borderRadius: 28,
  background: "rgba(20,22,27,0.88)",
  border: "1px solid rgba(255,255,255,0.12)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.34)",
  boxSizing: "border-box",
  pointerEvents: "auto",
};

const instaTextOnlyPanel: React.CSSProperties = {
  ...instaPanel,
  bottom: 122,
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
  border: "1px solid rgba(255,255,255,0.38)",
  borderRadius: 20,
  outline: "none",
  background: "transparent",
  color: "#ffffff",
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
  background: "linear-gradient(180deg, rgba(34,36,46,0.94), rgba(13,15,21,0.9))",
  border: "1px solid rgba(255,255,255,0.18)",
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
  color: "rgba(255,255,255,0.78)",
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
  background: "rgba(255,255,255,0.12)",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 950,
};

const instaSizeRange: React.CSSProperties = {
  width: "100%",
  height: 28,
  padding: "0 2px",
  accentColor: "#a78bfa",
  background: "rgba(255,255,255,0.16)",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
  touchAction: "pan-x",
  cursor: "pointer",
  WebkitUserSelect: "none",
  userSelect: "none",
};



const instaColorPreview: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "2px solid rgba(255,255,255,0.84)",
  boxShadow: "0 5px 12px rgba(0,0,0,0.2)",
  display: "block",
};

const instaHiddenColorInput: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
};







const instaShapeGrid: React.CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 2,
  WebkitOverflowScrolling: "touch",
};

const instaShapeButton: React.CSSProperties = {
  minWidth: 64,
  height: 40,
  padding: "0 12px",
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  flexShrink: 0,
};

const instaShapeButtonActive: React.CSSProperties = {
  background: "rgba(217,130,95,0.92)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.22)",
};

const instaShapeColorButton: React.CSSProperties = {
  ...instaShapeButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minWidth: 92,
  position: "relative",
};

const paletteWrap: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  right: "auto",
  bottom: 102,
  zIndex: 50,
  width: "min(92vw, 336px)",
  maxWidth: 336,
  transform: "translateX(-50%)",
  padding: 14,
  borderRadius: 26,
  background: "rgba(27,29,34,0.94)",
  border: "1px solid rgba(255,255,255,0.12)",
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
  color: "#ffffff",
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
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
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
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.08)",
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
  color: "rgba(255,255,255,0.82)",
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
  color: "#ffffff",
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
  color: "rgba(255,255,255,0.5)",
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

const sheetOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 500,
  background: "rgba(0,0,0,0)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
  transition: "background 0.24s ease",
  overflow: "hidden",
  overscrollBehavior: "none",
  touchAction: "none",
  pointerEvents: "auto",
  WebkitUserSelect: "none",
  userSelect: "none",
};

const sheet: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "88vh",
  borderRadius: 26,
  overflow: "hidden",
  background: "#1b1d22",
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
  display: "flex",
  flexDirection: "column",
  transform: "translateY(105%)",
  transition: "transform 0.26s ease",
  overscrollBehavior: "none",
  touchAction: "none",
  pointerEvents: "auto",
  userSelect: "none",
};

const sheetHandleWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  paddingTop: 10,
  paddingBottom: 4,
};

const sheetHandle: React.CSSProperties = {
  width: 44,
  height: 5,
  borderRadius: 999,
  background: "rgba(255,255,255,0.18)",
};

const sheetHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px 1fr 40px",
  alignItems: "start",
  gap: 8,
  padding: "4px 16px 10px",
};

const sheetHeaderSpacer: React.CSSProperties = {
  width: 40,
  height: 40,
};

const sheetTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 17,
  fontWeight: 700,
  textAlign: "center",
};

const sheetSubtitle: React.CSSProperties = {
  marginTop: 4,
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
  lineHeight: 1.45,
  textAlign: "center",
};

const sheetCloseButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 36,
  height: 36,
  borderRadius: 12,
  fontSize: 16,
  flexShrink: 0,
  marginTop: -2,
  touchAction: "manipulation",
};

const exportNameWrap: React.CSSProperties = {
  padding: "0 16px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const exportNameLabel: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
};

const exportNameInput: React.CSSProperties = {
  ...ui.input,
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
  touchAction: "manipulation",
  userSelect: "text",
};

const previewImageWrap: React.CSSProperties = {
  padding: 16,
  overflow: "auto",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "transparent",
};

const previewImage: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "58vh",
  objectFit: "contain",
  borderRadius: 18,
  background: "#ffffff",
};

const previewPlaceholder: React.CSSProperties = {
  color: "rgba(255,255,255,0.62)",
  fontSize: 13,
  padding: 24,
};

const previewActionsSingle: React.CSSProperties = {
  padding: 16,
};

const previewPrimaryButton: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 52,
  borderRadius: 16,
  fontSize: ds.font.buttonMd,
  touchAction: "manipulation",
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
  background: "#1b1d22",
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
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
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
  color: "#ffffff",
  fontSize: 17,
  fontWeight: 800,
  textAlign: "center",
};

const backConfirmText: React.CSSProperties = {
  marginTop: 10,
  color: "rgba(255,255,255,0.68)",
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
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
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
  background: "#ffffff",
  color: "#111216",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "none",
  pointerEvents: "auto",
  touchAction: "manipulation",
};
