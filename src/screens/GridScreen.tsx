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

type Tool = "move" | "brush" | "erase" | "add" | "deactivate" | "ruler" | "shape";
type ShapeType = "line" | "rectangle" | "ellipse";

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

const paletteColors = [
  "#111111",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#8e8e93",
];

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
  const [toolSize, setToolSize] = useState(1);
  const [rulerVisible, setRulerVisible] = useState(false);
  const [rulerLocked, setRulerLocked] = useState(false);
  const [shapeType, setShapeType] = useState<ShapeType>("line");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
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
  const autosaveTimeoutRef = useRef<number | null>(null);

  const isResizeWidthValid = isGridValueValid(resizeWidth);
  const isResizeHeightValid = isGridValueValid(resizeHeight);
  const isResizeDisabled = !data || !isResizeWidthValid || !isResizeHeightValid;

  useEffect(() => {
    const nextProjectId = data?.id ?? null;
    const isNewProjectOpened = openedProjectIdRef.current !== nextProjectId;

    setCurrentCells(initialCells);
    lastSavedCellsRef.current = initialCells;

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

    const isChanged = !areArraysEqual(currentCells, lastSavedCellsRef.current);

    if (!isChanged) return;

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      const nextProject: GridProject = {
        ...data,
        cells: currentCells,
      };

      onSave(nextProject);
      lastSavedCellsRef.current = currentCells;
      autosaveTimeoutRef.current = null;
    }, 700);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [currentCells, data, onSave]);

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

    const nextProject: GridProject = {
      ...data,
      cells: currentCells,
    };

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    onSave(nextProject);
    lastSavedCellsRef.current = currentCells;
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

      onSave(originalProject);
      setCurrentCells([...originalProject.cells]);
      lastSavedCellsRef.current = [...originalProject.cells];
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
    setRulerVisible((prev) => {
      const nextVisible = !prev;

      if (nextVisible) {
        setTool("ruler");
      } else {
        setRulerLocked(false);

        if (tool === "ruler") {
          setTool("brush");
        }
      }

      return nextVisible;
    });
  };

  const handleToggleRulerLocked = () => {
    setRulerLocked((prev) => !prev);
  };

  const handleApplyShape = () => {
    canvasGridRef.current?.applyCurrentShape();
  };

  const handleClearShape = () => {
    canvasGridRef.current?.clearCurrentShape();
  };

  const handleOpenPalette = () => {
    setIsExportSheetOpen(false);
    setIsExportSheetVisible(false);
    setIsResizeSheetOpen(false);
    setIsBackConfirmOpen(false);
    setIsPaletteOpen((prev) => !prev);
  };

  const handleSelectColor = (color: string) => {
    setActiveColor(color);
    setTool("brush");
    setIsPaletteOpen(false);
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
      const renamedProject: GridProject = {
        ...data,
        name: trimmedName,
        cells: currentCells,
      };

      onSave(renamedProject);
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

    const nextProject: GridProject = {
      ...data,
      width: nextWidth,
      height: nextHeight,
      cells: resizedCells,
    };

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    hasEditedInSessionRef.current = true;
    setCurrentCells(resizedCells);
    lastSavedCellsRef.current = resizedCells;
    onSave(nextProject);
    setIsResizeSheetOpen(false);
  };

  const gridSizeLabel = `${data?.width ?? 10}×${data?.height ?? 10}`;

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
              activeColor={activeColor}
              toolSize={toolSize}
              rulerVisible={rulerVisible}
              rulerLocked={rulerLocked}
              shapeType={shapeType}
              cells={currentCells}
              onCellsChange={handleCellsChange}
            />

            {isPaletteOpen && (
              <div style={paletteWrap}>
                <div style={paletteHeader}>
                  <div>
                    <div style={paletteTitle}>Цвет кисти</div>
                    <div style={paletteSubtitle}>
                      Выбери цвет и продолжай рисовать
                    </div>
                  </div>

                  <div
                    style={{
                      ...palettePreview,
                      background: activeColor,
                    }}
                  />
                </div>

                <div style={paletteGrid}>
                  {paletteColors.map((color) => {
                    const isActive = color === activeColor;

                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleSelectColor(color)}
                        style={{
                          ...paletteButton,
                          background: color,
                          border: isActive
                            ? "2px solid rgba(255,255,255,0.95)"
                            : color === "#ffffff"
                              ? "1px solid rgba(0,0,0,0.12)"
                              : "1px solid rgba(255,255,255,0.08)",
                          boxShadow: isActive
                            ? "0 0 0 3px rgba(10,132,255,0.35)"
                            : "none",
                        }}
                        aria-label={`Выбрать цвет ${color}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <BottomToolbar
              active={tool}
              activeColor={activeColor}
              toolSize={toolSize}
              rulerVisible={rulerVisible}
              rulerLocked={rulerLocked}
              shapeType={shapeType}
              onToolSizeChange={setToolSize}
              onChange={setTool}
              onOpenPalette={handleOpenPalette}
              onToggleRulerVisible={handleToggleRulerVisible}
              onToggleRulerLocked={handleToggleRulerLocked}
              onShapeTypeChange={setShapeType}
              onApplyShape={handleApplyShape}
              onClearShape={handleClearShape}
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
  fontWeight: 800,
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

const paletteWrap: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 100,
  zIndex: 25,
  padding: 14,
  borderRadius: 20,
  background: "rgba(27,29,34,0.82)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
};

const paletteHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const paletteTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
};

const paletteSubtitle: React.CSSProperties = {
  marginTop: 4,
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
};

const palettePreview: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.24)",
  flexShrink: 0,
};

const paletteGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: 10,
};

const paletteButton: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  borderRadius: 999,
  cursor: "pointer",
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
  width: "auto",
  height: "auto",
  maxWidth: "min(100%, 360px)",
  maxHeight: "48vh",
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
