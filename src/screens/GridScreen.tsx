import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import CanvasGrid, { type CanvasGridHandle } from "../components/CanvasGrid";
import BottomToolbar from "../components/BottomToolbar";
import type { GridData, GridProject } from "../App";

interface Props {
  onBack?: () => void;
  data: GridData | null;
  onSave: (project: GridProject) => void;
}

type Tool = "move" | "brush" | "erase";
type SaveStatus = "saved" | "draft" | "saving";
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

const getGridCellCount = (width: number, height: number) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const rowCount = safeHeight * 2 + 1;

  let count = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    count += rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  }

  return count;
};

const createFallbackCells = (width: number, height: number) => {
  return Array.from({ length: getGridCellCount(width, height) }, () => "#ffffff");
};

const areArraysEqual = (first: string[], second: string[]) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
};



const getGridTopOffset = () => {
  if (typeof window === "undefined") {
    return 0;
  }

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--grid-top-safe-space")
    .trim();

  const numericValue = Number.parseFloat(rawValue);

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
};


const GridScreen: React.FC<Props> = ({ onBack, data, onSave }) => {
  const [topOffset, setTopOffset] = useState<number>(getGridTopOffset);
  const [tool, setTool] = useState<Tool>("brush");
  const [activeColor, setActiveColor] = useState("#111111");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isExportSheetOpen, setIsExportSheetOpen] = useState(false);
  const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const canvasGridRef = useRef<CanvasGridHandle | null>(null);

  const initialCells = useMemo(() => {
    if (!data) return createFallbackCells(10, 10);

    return data.cells.length > 0
      ? data.cells
      : createFallbackCells(data.width, data.height);
  }, [data]);

  const [currentCells, setCurrentCells] = useState<string[]>(initialCells);
  const lastSavedCellsRef = useRef<string[]>(initialCells);
  const autosaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setCurrentCells(initialCells);
    lastSavedCellsRef.current = initialCells;
    setSaveStatus("saved");
  }, [initialCells]);

  useEffect(() => {
    const tg = (window as Window & {
      Telegram?: {
        WebApp?: {
          onEvent?: (eventName: string, handler: () => void) => void;
          offEvent?: (eventName: string, handler: () => void) => void;
        };
      };
    }).Telegram?.WebApp;

    const updateTopOffset = () => {
      setTopOffset(getGridTopOffset());
    };

    updateTopOffset();
    tg?.onEvent?.("viewportChanged", updateTopOffset);
    window.addEventListener("resize", updateTopOffset);
    window.visualViewport?.addEventListener("resize", updateTopOffset);

    return () => {
      tg?.offEvent?.("viewportChanged", updateTopOffset);
      window.removeEventListener("resize", updateTopOffset);
      window.visualViewport?.removeEventListener("resize", updateTopOffset);
    };
  }, []);

  useEffect(() => {
    if (!data) return;

    const isChanged = !areArraysEqual(currentCells, lastSavedCellsRef.current);

    if (!isChanged) {
      if (saveStatus !== "saving") {
        setSaveStatus("saved");
      }
      return;
    }

    if (saveStatus !== "saving") {
      setSaveStatus("draft");
    }

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      const nextProject: GridProject = {
        ...data,
        cells: currentCells,
      };

      setSaveStatus("saving");
      onSave(nextProject);
      lastSavedCellsRef.current = currentCells;
      setSaveStatus("saved");
      autosaveTimeoutRef.current = null;
    }, 700);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [currentCells, data, onSave, saveStatus]);

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenPalette = () => {
    setIsExportSheetOpen(false);
    setIsPaletteOpen((prev) => !prev);
  };

  const handleSelectColor = (color: string) => {
    setActiveColor(color);
    setTool("brush");
    setIsPaletteOpen(false);
  };

  const handleOpenExportSheet = async () => {
    if (isGeneratingPreview) return;

    setIsPaletteOpen(false);
    setIsExportSheetOpen(true);
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
    setIsExportSheetOpen(false);
    setPngPreviewUrl(null);
    setIsGeneratingPreview(false);
  };

  const handleDownloadPng = () => {
    canvasGridRef.current?.exportPng(data?.name ?? "beadly-project");
  };

  const saveStatusLabel =
    saveStatus === "saving"
      ? "Сохранение..."
      : saveStatus === "draft"
        ? "Черновик"
        : "Сохранено";

  return (
    <div style={root}>

      <div className="app-fixed" style={container}>
        <div
          style={{
            height: topOffset,
            flexShrink: 0,
          }}
        />

        <div style={topBar}>
          <button type="button" style={iconButton} onClick={onBack}>
            ←
          </button>

          <div
            style={{
              ...saveStatusStyle,
              color:
                saveStatus === "draft"
                  ? "#ffcc00"
                  : saveStatus === "saving"
                    ? "#8ec5ff"
                    : "rgba(255,255,255,0.78)",
            }}
          >
            <span
              style={{
                ...saveDotStyle,
                background:
                  saveStatus === "draft"
                    ? "#ffcc00"
                    : saveStatus === "saving"
                      ? "#0a84ff"
                      : "#34c759",
              }}
            />
            {saveStatusLabel}
            <span style={autosaveHint}>Автосейв</span>
          </div>

          <button type="button" style={exportButton} onClick={handleOpenExportSheet}>
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
              cells={currentCells}
              onCellsChange={setCurrentCells}
            />

            {isPaletteOpen && (
              <div style={paletteWrap}>
                <div style={paletteHeader}>
                  <div>
                    <div style={paletteTitle}>Цвет кисти</div>
                    <div style={paletteSubtitle}>Выбери цвет и продолжай рисовать</div>
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
              onChange={setTool}
              onOpenPalette={handleOpenPalette}
            />
          </div>
        </div>
      </div>

      {isExportSheetOpen && (
        <div style={sheetOverlay} onClick={handleCloseExportSheet}>
          <div style={sheet} onClick={(event) => event.stopPropagation()}>
            <div style={sheetHandleWrap}>
              <div style={sheetHandle} />
            </div>

            <div style={sheetHeader}>
              <div>
                <div style={sheetTitle}>PNG превью</div>
                <div style={sheetSubtitle}>
                  Проверь картинку перед скачиванием.
                </div>
              </div>

              <button
                type="button"
                style={sheetCloseButton}
                onClick={handleCloseExportSheet}
              >
                ✕
              </button>
            </div>

            <div style={previewImageWrap}>
              {isGeneratingPreview ? (
                <div style={previewPlaceholder}>Готовлю PNG...</div>
              ) : pngPreviewUrl ? (
                <img src={pngPreviewUrl} alt="PNG preview" style={previewImage} />
              ) : (
                <div style={previewPlaceholder}>PNG превью не удалось собрать</div>
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
  padding: 16,
  paddingBottom: "calc(16px + var(--app-safe-bottom, 0px))",
  boxSizing: "border-box",
  overflow: "hidden",
  touchAction: "none",
};

const topBar: React.CSSProperties = {
  position: "relative",
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 4,
  background: "#1b1d22",
  borderRadius: ds.radius.xl,
  padding: "10px 12px",
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
  flexShrink: 0,
};

const iconButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.sm,
  fontSize: 16,
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
};

const saveStatusStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 700,
  marginRight: "auto",
};

const saveDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
};

const autosaveHint: React.CSSProperties = {
  marginLeft: 4,
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.72)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.1,
};

const canvasWrapper: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
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
  background: "rgba(0,0,0,0.46)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
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
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 16px 14px",
};

const sheetTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 17,
  fontWeight: 700,
};

const sheetSubtitle: React.CSSProperties = {
  marginTop: 4,
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
  lineHeight: 1.45,
};

const sheetCloseButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 36,
  height: 36,
  borderRadius: 12,
  fontSize: 16,
  flexShrink: 0,
};





const previewImageWrap: React.CSSProperties = {
  padding: 16,
  overflow: "auto",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#111216",
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
  minHeight: 52,
  borderRadius: 16,
  fontSize: ds.font.buttonMd,
};
