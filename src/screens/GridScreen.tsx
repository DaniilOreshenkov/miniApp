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

type Tool = "select" | "move" | "brush" | "erase" | "palette";
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

const createFallbackCells = (width: number, height: number) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const rowCount = safeHeight * 2 + 1;

  let count = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    count += rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  }

  return Array.from({ length: count }, () => "#ffffff");
};

const areArraysEqual = (first: string[], second: string[]) => {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
};

const GridScreen: React.FC<Props> = ({ onBack, data, onSave }) => {
  const [topOffset, setTopOffset] = useState(72);
  const [tool, setTool] = useState<Tool>("brush");
  const [activeColor, setActiveColor] = useState("#111111");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

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
    const tg = (window as any).Telegram?.WebApp;

    const update = () => {
      if (!tg) return;

      const diff = (tg.viewportHeight || 0) - (tg.viewportStableHeight || 0);
      const base = diff > 0 ? diff : 56;
      setTopOffset(base + 12);
    };

    update();
    tg?.onEvent?.("viewportChanged", update);

    return () => {
      tg?.offEvent?.("viewportChanged", update);
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

  const handleSelectColor = (color: string) => {
    setActiveColor(color);
    setTool("brush");
  };

  const handleSave = () => {
    if (!data) return;

    const nextProject: GridProject = {
      ...data,
      cells: currentCells,
    };

    setSaveStatus("saving");
    onSave(nextProject);
    lastSavedCellsRef.current = currentCells;
    setSaveStatus("saved");

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
  };

  const handleExportPng = () => {
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
            height: `calc(env(safe-area-inset-top) + ${topOffset}px)`,
          }}
        />

        <div style={topBar}>
          <button style={iconButton} onClick={onBack}>
            ←
          </button>

          <button style={iconButton}>≡</button>

          <div
            style={{
              ...saveStatusStyle,
              color:
                saveStatus === "draft"
                  ? "#ffcc00"
                  : saveStatus === "saving"
                    ? "#8ec5ff"
                    : "rgba(255,255,255,0.72)",
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
          </div>

          <button style={exportButton} onClick={handleExportPng}>
            PNG
          </button>

          <button style={saveButton} onClick={handleSave}>
            Сохранить
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

            {tool === "palette" && (
              <div style={paletteWrap}>
                <div style={paletteHeader}>
                  <div style={paletteTitle}>Цвет</div>
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

            <BottomToolbar active={tool} onChange={setTool} />
          </div>
        </div>
      </div>
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
  boxSizing: "border-box",
  overflow: "hidden",
  touchAction: "none",
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
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
};

const exportButton: React.CSSProperties = {
  ...ui.secondaryButton,
  height: 40,
  padding: "0 14px",
  borderRadius: ds.radius.lg,
  fontSize: 13,
  fontWeight: 700,
  boxShadow: "none",
};

const saveButton: React.CSSProperties = {
  ...ui.primaryButton,
  height: 40,
  padding: "0 16px",
  borderRadius: ds.radius.lg,
  fontSize: ds.font.buttonMd,
};

const saveStatusStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  marginLeft: 4,
  marginRight: "auto",
};

const saveDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
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
  bottom: 98,
  zIndex: 25,
  padding: 12,
  borderRadius: 18,
  background: "rgba(27,29,34,0.76)",
  backdropFilter: "blur(16px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
};

const paletteHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const paletteTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
};

const palettePreview: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.24)",
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