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

type BottomTool = "move" | "brush" | "erase" | "palette";

const baseColor = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const getTouchDistance = (touches: React.TouchList | TouchList) => {
  const first = touches[0];
  const second = touches[1];

  if (!first || !second) return 0;

  const dx = second.clientX - first.clientX;
  const dy = second.clientY - first.clientY;

  return Math.sqrt(dx * dx + dy * dy);
};

const getTouchCenter = (
  touches: React.TouchList | TouchList,
  rect: DOMRect
) => {
  const first = touches[0];
  const second = touches[1];

  if (!first || !second) {
    return { x: 0, y: 0 };
  }

  return {
    x: (first.clientX + second.clientX) / 2 - rect.left,
    y: (first.clientY + second.clientY) / 2 - rect.top,
  };
};

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
  const [draftSettings, setDraftSettings] =
    useState<GridSettings>(initialSettings);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [activeBottomTool, setActiveBottomTool] =
    useState<BottomTool>("erase");

  const getRowLength = (rowIndex: number, crossesWidth: number) => {
    const shortRow = crossesWidth;
    const longRow = crossesWidth + 1;

    return rowIndex % 2 === 0 ? shortRow : longRow;
  };

  const createGrid = (s: GridSettings) =>
    Array.from({ length: s.height * 2 + 1 }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex, s.width) }, () => ({
        color: baseColor,
      }))
    );

  const [grid, setGrid] = useState<Cell[][]>(createGrid(initialSettings));

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const transformLayerRef = useRef<HTMLDivElement | null>(null);

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<number | null>(null);

  const pinchRef = useRef<{
    isPinching: boolean;
    startDistance: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    startCenterX: number;
    startCenterY: number;
  }>({
    isPinching: false,
    startDistance: 0,
    startZoom: 1,
    startPanX: 0,
    startPanY: 0,
    startCenterX: 0,
    startCenterY: 0,
  });

  const panDragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    isTouch: boolean;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    isTouch: false,
  });

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
    if (!viewportSize.width) return 1;

    const availableWidth = Math.max(viewportSize.width - 24, 240);
    return Math.min(1, availableWidth / boardWidth);
  }, [viewportSize.width, boardWidth]);

  const totalScale = fitScale * zoom;
  const viewportHeight = Math.max(
    360,
    Math.min(620, boardHeight * fitScale * Math.min(zoom, 1.25) + 48)
  );

  const clampPan = (
    nextX: number,
    nextY: number,
    nextZoom: number = zoomRef.current
  ) => {
    const scale = fitScale * nextZoom;
    const scaledWidth = boardWidth * scale;
    const scaledHeight = boardHeight * scale;

    const availableWidth = viewportSize.width || scaledWidth;
    const availableHeight = viewportSize.height || viewportHeight;

    const horizontalPadding = 72;
    const verticalPadding = 72;

    let x = nextX;
    let y = nextY;

    if (scaledWidth <= availableWidth - 12) {
      x = (availableWidth - scaledWidth) / 2;
    } else {
      const minX = availableWidth - scaledWidth - horizontalPadding;
      const maxX = horizontalPadding;
      x = clamp(nextX, minX, maxX);
    }

    if (scaledHeight <= availableHeight - 12) {
      y = (availableHeight - scaledHeight) / 2;
    } else {
      const minY = availableHeight - scaledHeight - verticalPadding;
      const maxY = verticalPadding;
      y = clamp(nextY, minY, maxY);
    }

    return { x, y };
  };

  const applyTransformDirectly = (
    nextPan: { x: number; y: number },
    nextZoom: number
  ) => {
    if (!transformLayerRef.current) return;

    const nextTotalScale = fitScale * nextZoom;
    transformLayerRef.current.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${nextTotalScale})`;
  };

  const scheduleTransform = (
    nextPan: { x: number; y: number },
    nextZoom: number
  ) => {
    panRef.current = nextPan;
    zoomRef.current = nextZoom;

    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      applyTransformDirectly(panRef.current, zoomRef.current);
      rafRef.current = null;
    });
  };

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

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    applyTransformDirectly(pan, zoom);
  }, [pan, zoom, fitScale]);

  useEffect(() => {
    setPan((prev) => {
      const next = clampPan(prev.x, prev.y, zoomRef.current);

      if (prev.x === next.x && prev.y === next.y) {
        return prev;
      }

      return next;
    });
  }, [
    fitScale,
    boardWidth,
    boardHeight,
    viewportSize.width,
    viewportSize.height,
  ]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      if (wheelTimeoutRef.current !== null) {
        window.clearTimeout(wheelTimeoutRef.current);
      }
    };
  }, []);

  const resetView = () => {
    const nextPan = clampPan(0, 0, 1);
    scheduleTransform(nextPan, 1);
    setZoom(1);
    setPan(nextPan);
  };

  const zoomTo = (
    nextZoomValue: number,
    anchor?: {
      x: number;
      y: number;
    }
  ) => {
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;

    const nextZoom = clamp(nextZoomValue, MIN_ZOOM, MAX_ZOOM);
    const oldScale = fitScale * currentZoom;
    const newScale = fitScale * nextZoom;

    if (!anchor || oldScale === 0) {
      const nextPan = clampPan(currentPan.x, currentPan.y, nextZoom);
      scheduleTransform(nextPan, nextZoom);
      setZoom(nextZoom);
      setPan(nextPan);
      return;
    }

    const contentX = (anchor.x - currentPan.x) / oldScale;
    const contentY = (anchor.y - currentPan.y) / oldScale;

    const nextX = anchor.x - contentX * newScale;
    const nextY = anchor.y - contentY * newScale;

    const nextPan = clampPan(nextX, nextY, nextZoom);

    scheduleTransform(nextPan, nextZoom);
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const applySettings = () => {
    const nextSettings = normalizeSettings(draftSettings);

    setSettings(nextSettings);
    setDraftSettings(nextSettings);
    setGrid(createGrid(nextSettings));
    setSettingsSheetOpen(false);

    const nextPan = clampPan(0, 0, 1);
    scheduleTransform(nextPan, 1);
    setZoom(1);
    setPan(nextPan);
  };

  const canStartPan = () => {
    return zoomRef.current > 1.02;
  };

  const startPanDrag = (clientX: number, clientY: number, isTouch: boolean) => {
    if (!canStartPan()) return;
    if (pinchRef.current.isPinching) return;

    panDragRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
      isTouch,
    };
  };

  const movePanDrag = (clientX: number, clientY: number) => {
    if (!panDragRef.current.isDragging) return;

    const dx = clientX - panDragRef.current.startX;
    const dy = clientY - panDragRef.current.startY;

    const nextPan = clampPan(
      panDragRef.current.startPanX + dx,
      panDragRef.current.startPanY + dy,
      zoomRef.current
    );

    scheduleTransform(nextPan, zoomRef.current);
  };

  const stopPanDrag = () => {
    if (!panDragRef.current.isDragging) return;

    panDragRef.current = {
      isDragging: false,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
      isTouch: false,
    };

    setPan(panRef.current);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panDragRef.current.isDragging) {
      movePanDrag(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    stopPanDrag();
  };

  const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();

    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const anchor = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const factor = e.deltaY < 0 ? 1.08 : 0.92;

    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const nextZoom = clamp(currentZoom * factor, MIN_ZOOM, MAX_ZOOM);

    const oldScale = fitScale * currentZoom;
    const newScale = fitScale * nextZoom;

    const contentX = (anchor.x - currentPan.x) / oldScale;
    const contentY = (anchor.y - currentPan.y) / oldScale;

    const nextX = anchor.x - contentX * newScale;
    const nextY = anchor.y - contentY * newScale;

    const nextPan = clampPan(nextX, nextY, nextZoom);

    scheduleTransform(nextPan, nextZoom);

    if (wheelTimeoutRef.current) {
      window.clearTimeout(wheelTimeoutRef.current);
    }

    wheelTimeoutRef.current = window.setTimeout(() => {
      setZoom(zoomRef.current);
      setPan(panRef.current);
    }, 60);
  };

  const handleViewportTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !viewportRef.current) return;

    e.preventDefault();

    const rect = viewportRef.current.getBoundingClientRect();

    pinchRef.current = {
      isPinching: true,
      startDistance: getTouchDistance(e.touches),
      startZoom: zoomRef.current,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
      startCenterX: getTouchCenter(e.touches, rect).x,
      startCenterY: getTouchCenter(e.touches, rect).y,
    };

    panDragRef.current = {
      isDragging: false,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
      isTouch: false,
    };
  };

  const handleViewportTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (
      !pinchRef.current.isPinching ||
      e.touches.length !== 2 ||
      !viewportRef.current
    ) {
      return;
    }

    e.preventDefault();

    const rect = viewportRef.current.getBoundingClientRect();
    const distance = getTouchDistance(e.touches);
    const center = getTouchCenter(e.touches, rect);

    if (!pinchRef.current.startDistance) return;

    const nextZoom = clamp(
      pinchRef.current.startZoom * (distance / pinchRef.current.startDistance),
      MIN_ZOOM,
      MAX_ZOOM
    );

    const oldScale = fitScale * pinchRef.current.startZoom;
    const newScale = fitScale * nextZoom;

    const contentX =
      (pinchRef.current.startCenterX - pinchRef.current.startPanX) / oldScale;
    const contentY =
      (pinchRef.current.startCenterY - pinchRef.current.startPanY) / oldScale;

    const nextX = center.x - contentX * newScale;
    const nextY = center.y - contentY * newScale;

    const nextPan = clampPan(nextX, nextY, nextZoom);
    scheduleTransform(nextPan, nextZoom);
  };

  const handleViewportTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchRef.current.isPinching = false;
      setZoom(zoomRef.current);
      setPan(panRef.current);
    }

    if (e.touches.length === 0) {
      stopPanDrag();
    }
  };

  const closeSettingsSheet = () => {
    setSettingsSheetOpen(false);
  };

  const renderSettingsFields = () => {
    return (
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

        <button onClick={applySettings} style={primaryButtonStyle}>
          Применить
        </button>
      </div>
    );
  };

  const renderSettingsSheet = () => {
    return (
      <>
        <div
          onClick={closeSettingsSheet}
          style={{
            position: "fixed",
            inset: 0,
            background: settingsSheetOpen
              ? "rgba(0,0,0,0.44)"
              : "rgba(0,0,0,0)",
            backdropFilter: settingsSheetOpen ? "blur(12px)" : "blur(0px)",
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
                "linear-gradient(180deg, rgba(22,32,58,0.98) 0%, rgba(12,18,34,0.98) 100%)",
              border: "1px solid rgba(140,170,255,0.10)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 -24px 60px rgba(0,0,0,0.40)",
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

            <div style={sheetHeaderRowStyle}>
              <button onClick={closeSettingsSheet} style={ghostTextButtonStyle}>
                Закрыть
              </button>

              <div style={sheetHeaderTitleStyle}>Настройка сетки</div>

              <div style={{ width: 62 }} />
            </div>

            <div style={sheetScrollContentStyle}>{renderSettingsFields()}</div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div
      style={{
        ...pageStyle,
        animation: "gridScreenFadeIn 320ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div style={contentWrapStyle}>
        <div style={headerZoneStyle}>
          <div style={headerMainRowStyle}>
            <div style={floatingToolbarStyle}>
              {onBack ? (
                <button
                  onClick={onBack}
                  style={toolbarIconButtonStyle}
                  title="Назад"
                >
                  ←
                </button>
              ) : null}

              <button
                onClick={resetView}
                style={toolbarIconButtonStyle}
                title="По размеру"
              >
                ⌂
              </button>

              <button style={toolbarIconButtonStyle} title="Помощь">
                ?
              </button>

              <button
                onClick={() => {
                  setDraftSettings(settings);
                  setSettingsSheetOpen(true);
                }}
                style={toolbarIconButtonStyle}
                title="Параметры"
              >
                ⚙
              </button>

              <button style={toolbarPrimaryDisabledStyle} disabled>
                Сохранить
              </button>
            </div>

            <div style={zoomPanelStyle}>
              <button
                onClick={resetView}
                style={zoomSideButtonStyle}
                title="Fit"
              >
                ⤢
              </button>

              <div style={zoomDividerStyle} />

              <button
                onClick={() => zoomTo(zoomRef.current * 0.9)}
                style={zoomValueButtonStyle}
                title="Уменьшить"
              >
                −
              </button>

              <div style={zoomValueLabelStyle}>{Math.round(zoom * 100)}%</div>

              <button
                onClick={() => zoomTo(zoomRef.current * 1.12)}
                style={zoomValueButtonStyle}
                title="Увеличить"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div style={boardShellStyle}>
          <div
            ref={viewportRef}
            onWheel={handleViewportWheel}
            onTouchStart={handleViewportTouchStart}
            onTouchMove={handleViewportTouchMove}
            onTouchEnd={handleViewportTouchEnd}
            onTouchCancel={handleViewportTouchEnd}
            style={viewportStyle(viewportHeight)}
          >
            <div
              onMouseDownCapture={(e) => {
                if (!canStartPan()) return;
                startPanDrag(e.clientX, e.clientY, false);
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStartCapture={(e) => {
                if (e.touches.length !== 1) return;
                if (!canStartPan()) return;

                const touch = e.touches[0];
                if (!touch) return;

                e.preventDefault();
                startPanDrag(touch.clientX, touch.clientY, true);
              }}
              onTouchMove={(e) => {
                if (e.touches.length !== 1) return;

                const touch = e.touches[0];
                if (!touch) return;

                if (panDragRef.current.isDragging) {
                  e.preventDefault();
                  movePanDrag(touch.clientX, touch.clientY);
                }
              }}
              onTouchEnd={() => {
                stopPanDrag();
              }}
              onTouchCancel={() => {
                stopPanDrag();
              }}
              style={interactionLayerStyle}
            >
              <div
                ref={transformLayerRef}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: boardWidth,
                  height: boardHeight,
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${totalScale})`,
                  transformOrigin: "top left",
                  willChange: "transform",
                  backfaceVisibility: "hidden",
                  touchAction: "none",
                }}
              >
                {grid.map((row, r) => {
                  const rowLength = getRowLength(r, settings.width);
                  const rowStartX =
                    rowLength === settings.width + 1 ? 0 : xStep / 2;

                  return row.map((cell, c) => {
                    const left = rowStartX + c * xStep;
                    const top = r * yStep;
                    const cellColor = cell.color || baseColor;
                    const isBase = cellColor === baseColor;

                    return (
                      <div
                        key={`${r}-${c}`}
                        style={{
                          position: "absolute",
                          left,
                          top,
                          width: bead,
                          height: bead,
                          borderRadius: "8px",
                          border: "1px solid rgba(9,14,25,0.12)",
                          background: isBase
                            ? "linear-gradient(180deg, #fdfdfd 0%, #f1f3f7 100%)"
                            : cellColor,
                          boxShadow: isBase
                            ? "inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 3px rgba(0,0,0,0.05)"
                            : "inset 0 1px 0 rgba(255,255,255,0.30), 0 2px 6px rgba(0,0,0,0.14)",
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

        <div style={bottomDockWrapStyle}>
          <div style={bottomDockRowStyle}>
            <div style={dockGroupStyle}>
              <button
                onClick={() => setActiveBottomTool("move")}
                style={bottomToolButtonStyle(activeBottomTool === "move")}
                title="Перемещение"
              >
                ✋
              </button>

              <button
                onClick={resetView}
                style={bottomToolButtonStyle(false)}
                title="Сбросить вид"
              >
                ↺
              </button>
            </div>

            <div style={dockGroupStyle}>
              <button
                onClick={() => setActiveBottomTool("brush")}
                style={bottomToolButtonStyle(activeBottomTool === "brush")}
                title="Кисть"
              >
                ✎
              </button>

              <button
                onClick={() => setActiveBottomTool("erase")}
                style={bottomToolButtonStyle(activeBottomTool === "erase")}
                title="Ластик"
              >
                ⌫
              </button>

              <button
                onClick={() => setActiveBottomTool("palette")}
                style={bottomToolButtonStyle(activeBottomTool === "palette")}
                title="Палитра"
              >
                🎨
              </button>

              <div style={colorPreviewButtonStyle} title="Текущий цвет" />
            </div>

            <div style={dockGroupStyle}>
              <button style={bottomToolButtonStyle(false)} title="Отменить">
                ↶
              </button>

              <button style={bottomToolButtonStyle(false)} title="Повторить">
                ↷
              </button>
            </div>
          </div>
        </div>
      </div>

      {renderSettingsSheet()}
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  width: "100%",
  height: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  minHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  maxHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  background:
    "radial-gradient(circle at top, rgba(78,124,255,0.18) 0%, rgba(78,124,255,0) 32%), linear-gradient(180deg, #10192f 0%, #0b1326 55%, #07101f 100%)",
  position: "relative",
  overflow: "hidden",
  overscrollBehavior: "none",
};

const contentWrapStyle: React.CSSProperties = {
  minHeight: "100%",
  height: "100%",
  padding:
    "max(14px, calc(env(safe-area-inset-top) + 8px)) 14px max(120px, calc(env(safe-area-inset-bottom) + 92px))",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  boxSizing: "border-box",
  width: "100%",
  position: "relative",
  zIndex: 2,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "none",
};

const headerZoneStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 14,
};

const headerMainRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
};

const floatingToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "10px 12px",
  borderRadius: 24,
  background: "rgba(14, 24, 45, 0.78)",
  border: "1px solid rgba(126, 160, 255, 0.14)",
  boxShadow: "0 14px 34px rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(20px)",
};

const toolbarIconButtonStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 16,
  border: "1px solid rgba(126, 160, 255, 0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#eaf1ff",
  cursor: "pointer",
  fontSize: 19,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  boxShadow: "0 4px 10px rgba(0,0,0,0.14)",
};

const toolbarPrimaryDisabledStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 16,
  border: "1px solid rgba(126, 160, 255, 0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(234,241,255,0.38)",
  cursor: "not-allowed",
  fontSize: 15,
  fontWeight: 700,
};

const zoomPanelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 24,
  background: "rgba(14, 24, 45, 0.78)",
  border: "1px solid rgba(126, 160, 255, 0.14)",
  boxShadow: "0 14px 34px rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(20px)",
};

const zoomSideButtonStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  border: "1px solid rgba(126, 160, 255, 0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#eaf1ff",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const zoomDividerStyle: React.CSSProperties = {
  width: 1,
  alignSelf: "stretch",
  background: "rgba(126, 160, 255, 0.16)",
};

const zoomValueButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  border: "none",
  background: "transparent",
  color: "#eaf1ff",
  cursor: "pointer",
  fontSize: 24,
  fontWeight: 500,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const zoomValueLabelStyle: React.CSSProperties = {
  minWidth: 70,
  textAlign: "center",
  color: "#f3f7ff",
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const boardShellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  padding: 12,
  borderRadius: 30,
  background: "rgba(13, 21, 40, 0.70)",
  border: "1px solid rgba(126, 160, 255, 0.12)",
  boxShadow: "0 20px 48px rgba(0,0,0,0.30)",
  backdropFilter: "blur(18px)",
};

const viewportStyle = (viewportHeight: number): React.CSSProperties => ({
  position: "relative",
  width: "100%",
  height: viewportHeight,
  overflow: "hidden",
  borderRadius: 24,
  background:
    "linear-gradient(180deg, rgba(245,247,252,0.98) 0%, rgba(236,240,247,0.98) 100%)",
  border: "1px solid rgba(126, 160, 255, 0.10)",
  touchAction: "none",
  overscrollBehavior: "contain",
});

const interactionLayerStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  touchAction: "none",
  overscrollBehavior: "contain",
};

const bottomDockWrapStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  position: "sticky",
  bottom: "max(18px, calc(env(safe-area-inset-bottom) + 12px))",
  marginTop: 14,
  paddingBottom: 2,
  zIndex: 12,
};

const bottomDockRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const dockGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 24,
  background: "rgba(14, 24, 45, 0.82)",
  border: "1px solid rgba(126, 160, 255, 0.14)",
  boxShadow: "0 14px 36px rgba(0,0,0,0.30)",
  backdropFilter: "blur(20px)",
};

const bottomToolButtonStyle = (active: boolean): React.CSSProperties => ({
  width: 52,
  height: 52,
  borderRadius: 18,
  border: active
    ? "1px solid rgba(78, 124, 255, 0.34)"
    : "1px solid rgba(126, 160, 255, 0.12)",
  background: active
    ? "linear-gradient(180deg, #4f80ff 0%, #315de8 100%)"
    : "rgba(255,255,255,0.06)",
  color: active ? "#ffffff" : "#eaf1ff",
  cursor: "pointer",
  fontSize: 24,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  boxShadow: active
    ? "0 10px 20px rgba(49,93,232,0.30)"
    : "0 4px 10px rgba(0,0,0,0.16)",
});

const colorPreviewButtonStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 18,
  border: "3px solid #eaf1ff",
  background: "#4f80ff",
  boxSizing: "border-box",
  boxShadow: "0 4px 10px rgba(0,0,0,0.16)",
};

const ghostTextButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#7db3ff",
  fontSize: 15,
  cursor: "pointer",
  padding: 0,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: 18,
  border: "1px solid rgba(126, 160, 255, 0.18)",
  background: "linear-gradient(180deg, #4f80ff 0%, #315de8 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: "0 14px 28px rgba(49,93,232,0.24)",
};

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(126, 160, 255, 0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const sheetHeaderRowStyle: React.CSSProperties = {
  padding: "0 16px 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexShrink: 0,
};

const sheetScrollContentStyle: React.CSSProperties = {
  padding: "0 16px 16px",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
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
  border: "1px solid rgba(126,160,255,0.12)",
  color: "rgba(255,255,255,0.82)",
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
  border: "1px solid rgba(126,160,255,0.10)",
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
