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
type ExportSheetView = "menu" | "png";

interface ProjectTransferPayload {
  type: "beadly-project";
  version: 1;
  name: string;
  width: number;
  height: number;
  cells: string[];
  exportedAt: string;
}

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

const sanitizeFileName = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");

  return normalized || "beadly-project";
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

const getGridTopOffset = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return 72;
  }

  const maybeWindow = window as Window & {
    Telegram?: {
      WebApp?: {
        viewportHeight?: number;
        viewportStableHeight?: number;
      };
    };
  };

  const tg = maybeWindow.Telegram?.WebApp;
  const touch =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true;

  if (tg && touch) {
    const diff = Math.max(0, (tg.viewportHeight || 0) - (tg.viewportStableHeight || 0));
    return Math.max(96, diff + 56);
  }

  if (tg) return 30;
  if (touch) return 32;

  return 20;
};

const isProjectTransferPayload = (value: unknown): value is ProjectTransferPayload => {
  if (!value || typeof value !== "object") return false;

  const payload = value as Partial<ProjectTransferPayload>;

  return (
    payload.type === "beadly-project" &&
    payload.version === 1 &&
    typeof payload.name === "string" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number" &&
    Array.isArray(payload.cells)
  );
};

const GridScreen: React.FC<Props> = ({ onBack, data, onSave }) => {
  const [topOffset, setTopOffset] = useState<number>(getGridTopOffset);
  const [tool, setTool] = useState<Tool>("brush");
  const [activeColor, setActiveColor] = useState("#111111");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isExportSheetOpen, setIsExportSheetOpen] = useState(false);
  const [exportSheetView, setExportSheetView] = useState<ExportSheetView>("menu");
  const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const canvasGridRef = useRef<CanvasGridHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
    setExportSheetView("menu");
    setIsPaletteOpen((prev) => !prev);
  };

  const handleSelectColor = (color: string) => {
    setActiveColor(color);
    setTool("brush");
    setIsPaletteOpen(false);
  };

  const handleOpenExportSheet = () => {
    setIsPaletteOpen(false);
    setExportSheetView("menu");
    setIsExportSheetOpen(true);
  };

  const handleCloseExportSheet = () => {
    setIsExportSheetOpen(false);
    setExportSheetView("menu");
    setPngPreviewUrl(null);
    setIsGeneratingPreview(false);
  };

  const handleOpenPngPreview = async () => {
    if (isGeneratingPreview) return;

    setIsGeneratingPreview(true);

    try {
      const preview = await canvasGridRef.current?.createPngPreview();
      if (preview) {
        setPngPreviewUrl(preview);
        setExportSheetView("png");
      }
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleDownloadPng = () => {
    canvasGridRef.current?.exportPng(data?.name ?? "beadly-project");
  };

  const handleDownloadProjectFile = () => {
    const payload: ProjectTransferPayload = {
      type: "beadly-project",
      version: 1,
      name: data?.name ?? "beadly-project",
      width: data?.width ?? 10,
      height: data?.height ?? 10,
      cells: currentCells,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    downloadBlob(blob, `${sanitizeFileName(payload.name)}.beadly.json`);
  };

  const handleOpenImportDialog = () => {
    importInputRef.current?.click();
  };

  const handleImportProject = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (!isProjectTransferPayload(parsed)) {
        window.alert("Файл проекта не распознан.");
        return;
      }

      const targetWidth = data?.width ?? 10;
      const targetHeight = data?.height ?? 10;
      const expectedCount = getGridCellCount(targetWidth, targetHeight);

      if (parsed.width !== targetWidth || parsed.height !== targetHeight) {
        window.alert("Размер сетки в файле не совпадает с текущим проектом.");
        return;
      }

      if (parsed.cells.length !== expectedCount) {
        window.alert("В файле повреждено количество ячеек.");
        return;
      }

      setCurrentCells(parsed.cells);
      lastSavedCellsRef.current = parsed.cells;
      setSaveStatus("draft");
      setIsExportSheetOpen(false);
      setExportSheetView("menu");
      setPngPreviewUrl(null);
      setIsPaletteOpen(false);
    } catch {
      window.alert("Не удалось прочитать файл проекта.");
    } finally {
      event.target.value = "";
    }
  };

  const saveStatusLabel =
    saveStatus === "saving"
      ? "Сохранение..."
      : saveStatus === "draft"
        ? "Черновик"
        : "Сохранено";

  const projectName = data?.name?.trim() || "Новый проект";
  const projectSizeLabel = `${data?.width ?? 10}×${data?.height ?? 10}`;

  return (
    <div style={root}>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.beadly.json,application/json"
        style={hiddenInput}
        onChange={handleImportProject}
      />

      <div className="app-fixed" style={container}>
        <div
          style={{
            height: `calc(env(safe-area-inset-top) + ${topOffset}px)`,
          }}
        />

        <div style={heroTopBar}>
          <div style={topBarBackdropGlow} />

          <div style={topBar}>
            <div style={topBarLeft}>
              <button type="button" style={iconButton} onClick={onBack}>
                ←
              </button>

              <div style={projectMetaWrap}>
                <div style={projectNameStyle}>{projectName}</div>

                <div style={projectMetaRow}>
                  <span style={projectChipStyle}>{projectSizeLabel}</span>

                  <div
                    style={{
                      ...saveStatusStyle,
                      color:
                        saveStatus === "draft"
                          ? "#ffd95e"
                          : saveStatus === "saving"
                            ? "#8ec5ff"
                            : "rgba(236,241,255,0.86)",
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
                </div>
              </div>
            </div>

            <button type="button" style={exportButton} onClick={handleOpenExportSheet}>
              Экспорт
            </button>
          </div>
        </div>

        <div style={canvasWrapper}>
          <div style={canvas}>
            <div style={canvasEdgeGlow} />
            <div style={canvasNoiseOverlay} />

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
                <div style={sheetTitle}>
                  {exportSheetView === "png" ? "PNG превью" : "Экспорт и файл проекта"}
                </div>
                <div style={sheetSubtitle}>
                  {exportSheetView === "png"
                    ? "Проверь картинку перед скачиванием"
                    : "Проект сохраняется автоматически, здесь только экспорт и файл проекта."}
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

            {exportSheetView === "menu" ? (
              <div style={exportMenu}>
                <button
                  type="button"
                  style={exportActionButton}
                  onClick={handleOpenPngPreview}
                  disabled={isGeneratingPreview}
                >
                  <span style={exportActionTitle}>
                    {isGeneratingPreview ? "Готовлю PNG..." : "PNG изображение"}
                  </span>
                  <span style={exportActionText}>
                    Скачать сетку как картинку
                  </span>
                </button>

                <button
                  type="button"
                  style={exportActionButton}
                  onClick={handleDownloadProjectFile}
                >
                  <span style={exportActionTitle}>Файл проекта</span>
                  <span style={exportActionText}>
                    Скачать сетку для переноса и бэкапа
                  </span>
                </button>

                <button
                  type="button"
                  style={exportActionButton}
                  onClick={handleOpenImportDialog}
                >
                  <span style={exportActionTitle}>Загрузить файл проекта</span>
                  <span style={exportActionText}>
                    Подтянуть сохраненную сетку обратно
                  </span>
                </button>
              </div>
            ) : (
              <>
                <div style={previewImageWrap}>
                  {pngPreviewUrl ? (
                    <img src={pngPreviewUrl} alt="PNG preview" style={previewImage} />
                  ) : (
                    <div style={previewPlaceholder}>PNG превью не удалось собрать</div>
                  )}
                </div>

                <div style={previewActions}>
                  <button
                    type="button"
                    style={previewSecondaryButton}
                    onClick={() => setExportSheetView("menu")}
                  >
                    Назад
                  </button>

                  <button
                    type="button"
                    style={previewPrimaryButton}
                    onClick={handleDownloadPng}
                  >
                    Скачать PNG
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GridScreen;


const hiddenInput: React.CSSProperties = {
  display: "none",
};

const root: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background:
    "radial-gradient(circle at top, rgba(72,115,255,0.18), transparent 34%), radial-gradient(circle at bottom, rgba(0,199,190,0.14), transparent 28%), linear-gradient(180deg, #0c0f17 0%, #111521 46%, #0f131d 100%)",
};

const container: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 16,
  boxSizing: "border-box",
  overflow: "hidden",
  touchAction: "none",
  position: "relative",
};

const heroTopBar: React.CSSProperties = {
  position: "relative",
  marginTop: 4,
  marginBottom: 16,
};

const topBarBackdropGlow: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 28,
  background:
    "linear-gradient(135deg, rgba(75,110,255,0.24), rgba(0,199,190,0.14) 55%, rgba(255,255,255,0.06))",
  filter: "blur(22px)",
  opacity: 0.9,
  pointerEvents: "none",
};

const topBar: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "12px 14px",
  borderRadius: 28,
  background: "rgba(14,18,28,0.78)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow:
    "0 18px 44px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
};

const topBarLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
  flex: 1,
};

const projectMetaWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const projectNameStyle: React.CSSProperties = {
  color: "#f6f8ff",
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  letterSpacing: -0.2,
};

const projectMetaRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const projectChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(240,244,255,0.82)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.2,
  flexShrink: 0,
};

const iconButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 44,
  height: 44,
  borderRadius: 18,
  fontSize: 17,
  flexShrink: 0,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  color: "#ffffff",
};

const exportButton: React.CSSProperties = {
  ...ui.primaryButton,
  height: 46,
  padding: "0 18px",
  borderRadius: 18,
  fontSize: 13,
  fontWeight: 800,
  boxShadow:
    "0 10px 24px rgba(10,132,255,0.30), inset 0 1px 0 rgba(255,255,255,0.20)",
  flexShrink: 0,
  background:
    "linear-gradient(135deg, rgba(66,133,255,1), rgba(88,86,214,0.96))",
  border: "1px solid rgba(255,255,255,0.14)",
};

const saveStatusStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  fontSize: 12,
  fontWeight: 700,
};

const saveDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
  boxShadow: "0 0 0 4px rgba(255,255,255,0.05)",
};

const autosaveHint: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.64)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const canvasWrapper: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const canvas: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background:
    "radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 35%), linear-gradient(180deg, rgba(22,27,40,0.96), rgba(12,16,24,0.96))",
  borderRadius: 30,
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow:
    "0 24px 60px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)",
};

const canvasEdgeGlow: React.CSSProperties = {
  position: "absolute",
  inset: -1,
  borderRadius: 30,
  background:
    "linear-gradient(135deg, rgba(88,86,214,0.20), rgba(10,132,255,0.06) 45%, rgba(0,199,190,0.16))",
  opacity: 0.7,
  filter: "blur(24px)",
  pointerEvents: "none",
};

const canvasNoiseOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 30,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 24%, transparent 76%, rgba(255,255,255,0.03))",
  pointerEvents: "none",
};

const paletteWrap: React.CSSProperties = {
  position: "absolute",
  left: 14,
  right: 14,
  bottom: 104,
  zIndex: 25,
  padding: 16,
  borderRadius: 24,
  background: "rgba(14,18,28,0.84)",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(22px)",
  boxShadow:
    "0 20px 50px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const paletteHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const paletteTitle: React.CSSProperties = {
  color: "#f6f8ff",
  fontSize: 16,
  fontWeight: 800,
};

const paletteSubtitle: React.CSSProperties = {
  marginTop: 4,
  color: "rgba(234,239,255,0.62)",
  fontSize: 12,
};

const palettePreview: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "2px solid rgba(255,255,255,0.22)",
  flexShrink: 0,
  boxShadow: "0 8px 22px rgba(0,0,0,0.22)",
};

const paletteGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 12,
};

const paletteButton: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  borderRadius: 999,
  cursor: "pointer",
  transition: "transform 140ms ease, box-shadow 140ms ease",
};

const sheetOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 500,
  background: "rgba(4,8,14,0.58)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
  backdropFilter: "blur(10px)",
};

const sheet: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "88vh",
  borderRadius: 30,
  overflow: "hidden",
  background:
    "linear-gradient(180deg, rgba(18,23,35,0.98), rgba(12,16,24,0.98))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow:
    "0 24px 80px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.06)",
  display: "flex",
  flexDirection: "column",
};

const sheetHandleWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  paddingTop: 12,
  paddingBottom: 4,
};

const sheetHandle: React.CSSProperties = {
  width: 46,
  height: 5,
  borderRadius: 999,
  background: "rgba(255,255,255,0.20)",
};

const sheetHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 18px 16px",
};

const sheetTitle: React.CSSProperties = {
  color: "#f7f9ff",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: -0.2,
};

const sheetSubtitle: React.CSSProperties = {
  marginTop: 5,
  color: "rgba(233,239,255,0.60)",
  fontSize: 12,
  lineHeight: 1.5,
};

const sheetCloseButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 38,
  height: 38,
  borderRadius: 14,
  fontSize: 16,
  flexShrink: 0,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const exportMenu: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: "0 16px 16px",
};

const exportActionButton: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 22,
  padding: "16px 16px",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  color: "#ffffff",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 5,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const exportActionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#f7f9ff",
};

const exportActionText: React.CSSProperties = {
  color: "rgba(233,239,255,0.60)",
  fontSize: 12,
  lineHeight: 1.45,
};

const previewImageWrap: React.CSSProperties = {
  padding: 16,
  overflow: "auto",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background:
    "radial-gradient(circle at top, rgba(255,255,255,0.06), transparent 32%), #0b0e15",
};

const previewImage: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "58vh",
  objectFit: "contain",
  borderRadius: 22,
  background: "#ffffff",
  boxShadow: "0 20px 50px rgba(0,0,0,0.26)",
};

const previewPlaceholder: React.CSSProperties = {
  color: "rgba(255,255,255,0.62)",
  fontSize: 13,
  padding: 24,
};

const previewActions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: 16,
};

const previewSecondaryButton: React.CSSProperties = {
  ...ui.secondaryButton,
  minHeight: 54,
  borderRadius: 18,
  fontSize: ds.font.buttonMd,
  boxShadow: "none",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const previewPrimaryButton: React.CSSProperties = {
  ...ui.primaryButton,
  minHeight: 54,
  borderRadius: 18,
  fontSize: ds.font.buttonMd,
  boxShadow:
    "0 12px 28px rgba(10,132,255,0.24), inset 0 1px 0 rgba(255,255,255,0.18)",
};
