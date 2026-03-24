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

        <button onClick={applySettings} style={heroButtonStyle}>
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
              ? "rgba(0,0,0,0.38)"
              : "rgba(0,0,0,0)",
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
              <button
                onClick={closeSettingsSheet}
                style={ghostTextButtonStyle}
              >
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
              {renderSettingsFields()}
            </div>
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
      <div
        style={{
          minHeight: "100%",
          height: "100%",
          padding: "max(12px, env(safe-area-inset-top)) 18px 24px",
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
        }}
      >
        <div style={topBarShellStyle}>
          <div style={topBarStyle}>
            <div style={topBarSideStyle}>
              {onBack ? (
                <button onClick={onBack} style={topBarIconButtonStyle}>
                  ←
                </button>
              ) : (
                <div style={topBarPlaceholderStyle} />
              )}
            </div>

            <div style={topBarCenterStyle}>
              <div style={topBarTitleStyle}>Сетка</div>
              <div style={topBarSubtitleStyle}>
                {settings.width}×{settings.height} крестиков
              </div>
            </div>

            <div style={{ ...topBarSideStyle, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setDraftSettings(settings);
                  setSettingsSheetOpen(true);
                }}
                style={topBarPillButtonStyle}
              >
                Параметры
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            padding: 14,
            borderRadius: 22,
            background: "rgba(28, 30, 36, 0.72)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(22px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
          }}
        >
          <div
            ref={viewportRef}
            onWheel={handleViewportWheel}
            onTouchStart={handleViewportTouchStart}
            onTouchMove={handleViewportTouchMove}
            onTouchEnd={handleViewportTouchEnd}
            onTouchCancel={handleViewportTouchEnd}
            style={{
              position: "relative",
              width: "100%",
              height: viewportHeight,
              overflow: "hidden",
              borderRadius: 18,
              background: "rgba(18, 20, 25, 0.82)",
              border: "1px solid rgba(255,255,255,0.05)",
              touchAction: "none",
              overscrollBehavior: "contain",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: 12,
                top: 12,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div
                style={{
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
                {Math.round(zoom * 100)}%
              </div>

              <button
                onClick={() => zoomTo(zoomRef.current * 1.12)}
                style={floatingZoomButtonStyle}
              >
                +
              </button>

              <button
                onClick={() => zoomTo(zoomRef.current * 0.9)}
                style={floatingZoomButtonStyle}
              >
                −
              </button>

              <button
                onClick={resetView}
                style={floatingZoomButtonStyle}
                title="Fit"
              >
                Fit
              </button>
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
              Щипок — zoom • drag — перемещение
            </div>

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
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                touchAction: "none",
                cursor: canStartPan() ? "grab" : "default",
                overscrollBehavior: "contain",
              }}
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
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.22)",
                          background: isBase
                            ? "linear-gradient(180deg, #fafafa 0%, #e9eaec 100%)"
                            : cellColor,
                          boxShadow: isBase
                            ? "inset 0 1px 2px rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.12)"
                            : "inset 0 1px 2px rgba(255,255,255,0.18), 0 2px 6px rgba(0,0,0,0.16)",
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
  background: "linear-gradient(180deg, #121318 0%, #0c0e12 100%)",
  position: "relative",
  overflow: "hidden",
  overscrollBehavior: "none",
};

const topBarShellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  marginBottom: 16,
};

const topBarStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 12,
  minHeight: 64,
  padding: "10px 12px",
  borderRadius: 22,
  background: "rgba(28, 30, 36, 0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
};

const topBarSideStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

const topBarCenterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
};

const topBarTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const topBarSubtitleStyle: React.CSSProperties = {
  marginTop: 3,
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const topBarIconButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  flexShrink: 0,
};

const topBarPillButtonStyle: React.CSSProperties = {
  minHeight: 42,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const topBarPlaceholderStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  flexShrink: 0,
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

const floatingZoomButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(22,24,30,0.84)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  backdropFilter: "blur(16px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
};

const ghostTextButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#64A8FF",
  fontSize: 15,
  cursor: "pointer",
  padding: 0,
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