import React, { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  onBack?: () => void;
  width?: number;
  height?: number;
  wallHeight?: number;
  beadSize?: string;
}

type Cell = {
  color: string;
};

type GridSettings = {
  width: number;
  height: number;
};

const colors = ["#FF3B30", "#FF9500", "#34C759", "#007AFF", "#AF52DE"];
const baseColor = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const GridScreen: React.FC<Props> = ({
  onBack,
  width,
  height,
  wallHeight,
  beadSize,
}) => {
  const initialSettings: GridSettings = {
    width: Math.max(1, width ?? 10),
    height: Math.max(1, height ?? 10),
  };

  const [settings, setSettings] = useState<GridSettings>(initialSettings);
  const [draftSettings, setDraftSettings] = useState<GridSettings>(initialSettings);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [grid, setGrid] = useState<Cell[][]>(() => createGrid(initialSettings));
  const [currentColor] = useState<string>(colors[0]);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement | null>(null);

  function getRowLength(rowIndex: number, crossesWidth: number) {
    return rowIndex % 2 === 0 ? crossesWidth : crossesWidth + 1;
  }

  function createGrid(s: GridSettings) {
    return Array.from({ length: s.height * 2 + 1 }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex, s.width) }, () => ({
        color: baseColor,
      }))
    );
  }

  const normalizeSettings = (s: GridSettings): GridSettings => {
    const normalizedWidth = Math.max(1, Number(s.width) || 1);
    const normalizedHeight = Math.max(1, Number(s.height) || 1);

    return {
      width: normalizedWidth,
      height: normalizedHeight,
    };
  };

  const boardWidth = settings.width * xStep + bead;
  const boardHeight = settings.height * 2 * yStep + bead;

  const fitScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) return 1;

    const availableWidth = Math.max(viewportSize.width - 56, 220);
    const availableHeight = Math.max(viewportSize.height - 96, 220);

    return Math.min(1, availableWidth / boardWidth, availableHeight / boardHeight);
  }, [viewportSize.width, viewportSize.height, boardWidth, boardHeight]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
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

  const applySettings = () => {
    const nextSettings = normalizeSettings(draftSettings);
    setSettings(nextSettings);
    setDraftSettings(nextSettings);
    setGrid(createGrid(nextSettings));
    setSettingsSheetOpen(false);
  };

  const paintCell = (r: number, c: number) => {
    setGrid((prev) => {
      if (!prev[r] || !prev[r][c]) return prev;

      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      next[r][c].color = currentColor;
      return next;
    });
  };

  return (
    <div
      style={{
        ...pageStyle,
        animation: "gridScreenFadeIn 320ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div
        style={{
          minHeight: "100%",
          height: "100%",
          padding: "0 18px 18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxSizing: "border-box",
          width: "100%",
          position: "relative",
          zIndex: 2,
          overflow: "hidden",
        }}
      >
        <div style={gridHeaderWrapStyle}>
          <div style={gridHeaderStyle}>
            <div style={gridHeaderLeftStyle}>
              <button
                onClick={() => {
                  setDraftSettings(settings);
                  setSettingsSheetOpen(true);
                }}
                style={gridHeaderButtonStyle}
              >
                Параметры
              </button>

              {onBack ? (
                <button onClick={onBack} style={gridHeaderButtonStyle}>
                  Назад
                </button>
              ) : null}
            </div>

            <div style={gridHeaderRightStyle}>
              <div style={gridHeaderChipStyle}>
                {settings.width}×{settings.height} крест.
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            flex: 1,
            minHeight: 0,
            padding: 14,
            borderRadius: 22,
            background: "rgba(28, 30, 36, 0.72)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(22px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            ref={viewportRef}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "hidden",
              borderRadius: 18,
              background: "rgba(18, 20, 25, 0.82)",
              border: "1px solid rgba(255,255,255,0.05)",
              userSelect: "none",
              WebkitUserSelect: "none",
              flex: 1,
              minHeight: 0,
              touchAction: "auto",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: 12,
                top: 12,
                zIndex: 10,
                padding: "7px 10px",
                minWidth: 56,
                textAlign: "center",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(22,24,30,0.84)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                backdropFilter: "blur(16px)",
              }}
            >
              Static
            </div>

            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                zIndex: 10,
                padding: "8px 10px",
                borderRadius: 14,
                background: "rgba(19,21,27,0.82)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.85)",
                fontSize: 12,
                backdropFilter: "blur(16px)",
              }}
            >
              Движение отключено
            </div>

            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: boardWidth,
                height: boardHeight,
                transform: `translate(-50%, -50%) scale(${fitScale})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              {grid.map((row, r) => {
                const rowLength = getRowLength(r, settings.width);
                const rowStartX = rowLength === settings.width + 1 ? 0 : xStep / 2;

                return row.map((cell, c) => {
                  const left = rowStartX + c * xStep;
                  const top = r * yStep;
                  const isBase = cell.color === baseColor;

                  return (
                    <div
                      key={`${r}-${c}`}
                      onMouseDown={() => {
                        paintCell(r, c);
                      }}
                      style={{
                        position: "absolute",
                        left,
                        top,
                        width: bead,
                        height: bead,
                        borderRadius: "50%",
                        border: "1px solid rgba(0,0,0,0.22)",
                        background: isBase
                          ? "linear-gradient(180deg, #fafafa 0%, #e9eaec 100%)"
                          : cell.color,
                        boxShadow:
                          "inset 0 1px 2px rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.12)",
                        boxSizing: "border-box",
                      }}
                    />
                  );
                });
              })}
            </div>
          </div>
        </div>
      </div>

      <>
        <div
          onClick={() => setSettingsSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: settingsSheetOpen ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0)",
            backdropFilter: settingsSheetOpen ? "blur(10px)" : "blur(0px)",
            pointerEvents: settingsSheetOpen ? "auto" : "none",
            transition: "all 0.24s ease",
            zIndex: 150,
          }}
        />

        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 160,
            transform: settingsSheetOpen ? "translateY(0)" : "translateY(105%)",
            transition: "transform 0.26s ease",
            padding: "0 10px max(10px, env(safe-area-inset-bottom))",
            pointerEvents: settingsSheetOpen ? "auto" : "none",
          }}
        >
          <div
            style={{
              maxWidth: 560,
              margin: "0 auto",
              borderRadius: 30,
              overflow: "hidden",
              background:
                "linear-gradient(180deg, rgba(35,37,43,0.96) 0%, rgba(24,26,31,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 -20px 50px rgba(0,0,0,0.34)",
              maxHeight: "min(78vh, 680px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 10,
                paddingBottom: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.18)",
                }}
              />
            </div>

            <div
              style={{
                padding: "0 16px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <button onClick={() => setSettingsSheetOpen(false)} style={ghostTextButtonStyle}>
                Закрыть
              </button>

              <div style={sheetHeaderTitleStyle}>Настройка сетки</div>

              <div style={{ width: 62 }} />
            </div>

            <div
              style={{
                padding: "0 16px 16px",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div style={sheetContentStackStyle}>
                <div style={settingsMetaStyle}>
                  <div style={settingsMetaChipStyle}>Стенка: {wallHeight ?? 3}</div>
                  <div style={settingsMetaChipStyle}>Бусина: {beadSize ?? "2 мм"}</div>
                </div>

                <div style={settingsFieldsGridStyle}>
                  <div style={settingsFieldCardStyle}>
                    <div style={settingsActionTitleStyle}>Ширина (крестики)</div>
                    <input
                      type="number"
                      min={1}
                      value={draftSettings.width}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          width: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      style={{ ...inputStyle, marginTop: 10 }}
                    />
                  </div>

                  <div style={settingsFieldCardStyle}>
                    <div style={settingsActionTitleStyle}>Длина (крестики)</div>
                    <input
                      type="number"
                      min={1}
                      value={draftSettings.height}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          height: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      style={{ ...inputStyle, marginTop: 10 }}
                    />
                  </div>
                </div>

                <button onClick={applySettings} style={heroButtonStyle}>
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  width: "100%",
  height: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  minHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  maxHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  background: "linear-gradient(180deg, #121318 0%, #0c0e12 100%)",
  position: "relative",
  overflow: "hidden",
  overscrollBehavior: "none",
};

const heroButtonStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.08) 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
};

const ghostTextButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#64A8FF",
  fontSize: 15,
  cursor: "pointer",
  padding: 0,
};

const gridHeaderWrapStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  paddingTop: "calc(var(--tg-safe-top, 0px) + 8px)",
  marginBottom: 14,
  flexShrink: 0,
};

const gridHeaderStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 56,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 22,
  background: "rgba(28, 30, 36, 0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
  boxSizing: "border-box",
  flexWrap: "nowrap",
  overflow: "hidden",
};

const gridHeaderLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  flex: 1,
  flexWrap: "nowrap",
};

const gridHeaderRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexShrink: 0,
  flexWrap: "nowrap",
};

const gridHeaderButtonStyle: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const gridHeaderChipStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.84)",
  fontSize: 13,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const sheetHeaderTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
};

const sheetContentStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 4,
};

const settingsMetaStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const settingsMetaChipStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.8)",
  fontSize: 12,
};

const settingsFieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const settingsFieldCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.04)",
};

const settingsActionTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("grid-screen-anim-style")
) {
  const style = document.createElement("style");
  style.id = "grid-screen-anim-style";
  style.innerHTML = `
    @keyframes gridScreenFadeIn {
      0% {
        opacity: 0;
        transform: translateY(18px) scale(0.992);
        filter: blur(8px);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }

    html, body {
      overscroll-behavior: none;
    }
  `;
  document.head.appendChild(style);
}

export default GridScreen;
