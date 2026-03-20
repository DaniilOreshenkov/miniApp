import React, { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  onBack?: () => void;
  width?: number;
  height?: number;
  wallHeight?: number;
  beadSize?: string;
}

type ZoneType =
  | "bottom"
  | "wall"
  | "edge"
  | "lid"
  | "handle"
  | "complex"
  | "hardware";

type ToolType = "paint" | "stripe" | "zone" | "erase" | "text";
type TextTab = "style" | "size" | "rotate";

type Cell = {
  color: string;
  zone: ZoneType | null;
};

type TextNote = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  rotation: number;
  fontWeight: 600 | 800;
};

type GridSettings = {
  width: number;
  height: number;
};

const colors = ["#FF3B30", "#FF9500", "#34C759", "#007AFF", "#AF52DE"];

const textColors = [
  "#FFFFFF",
  "#FF3B30",
  "#FF9500",
  "#FFD60A",
  "#34C759",
  "#64D2FF",
  "#0A84FF",
  "#BF5AF2",
  "#FF66B3",
  "#000000",
];

const baseColor = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 4;

const zoneLabels: Record<ZoneType, string> = {
  bottom: "Дно",
  wall: "Стенки",
  edge: "Торец",
  lid: "Крышка",
  handle: "Ручка",
  complex: "Сложная зона",
  hardware: "Крепление",
};

const zoneColors: Record<ZoneType, string> = {
  bottom: "rgba(255, 59, 48, 0.24)",
  wall: "rgba(52, 199, 89, 0.24)",
  edge: "rgba(0, 122, 255, 0.24)",
  lid: "rgba(255, 149, 0, 0.24)",
  handle: "rgba(175, 82, 222, 0.24)",
  complex: "rgba(255, 204, 0, 0.24)",
  hardware: "rgba(90, 200, 250, 0.24)",
};

const tools: {
  key: ToolType;
  label: string;
  icon: string;
}[] = [
  { key: "paint", label: "Покраска", icon: "🎨" },
  { key: "stripe", label: "Полоса", icon: "🟰" },
  { key: "zone", label: "Зона", icon: "📍" },
  { key: "erase", label: "Ластик", icon: "🧽" },
  { key: "text", label: "Текст", icon: "T" },
];

const textTabs: { key: TextTab; label: string }[] = [
  { key: "style", label: "Стиль" },
  { key: "size", label: "Размер" },
  { key: "rotate", label: "Поворот" },
];

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

const GridScreen: React.FC<Props> = ({ width, height }) => {
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
        zone: null,
      }))
    );

  const [grid, setGrid] = useState<Cell[][]>(createGrid(initialSettings));
  const [currentColor, setCurrentColor] = useState<string>(colors[0]);
  const [activeTool, setActiveTool] = useState<ToolType>("paint");
  const [selectedZone, setSelectedZone] = useState<ZoneType>("bottom");

  const [notes, setNotes] = useState<TextNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [draftText, setDraftText] = useState("17 крестиков");
  const [draftTextColor, setDraftTextColor] = useState("#FFFFFF");
  const [draftFontSize, setDraftFontSize] = useState(20);
  const [draftRotation, setDraftRotation] = useState(0);
  const [draftBold, setDraftBold] = useState(true);

  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [textTab, setTextTab] = useState<TextTab>("style");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const transformLayerRef = useRef<HTMLDivElement | null>(null);

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<number | null>(null);

  const dragRef = useRef<{
    noteId: string | null;
    offsetX: number;
    offsetY: number;
    isTouch: boolean;
  }>({
    noteId: null,
    offsetX: 0,
    offsetY: 0,
    isTouch: false,
  });

  const drawRef = useRef<{
    isDrawing: boolean;
    lastKey: string | null;
  }>({
    isDrawing: false,
    lastKey: null,
  });

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

  const selectedNote = notes.find((note) => note.id === selectedNoteId) || null;

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
    setNotes([]);
    setSelectedNoteId(null);
    setActiveTool("paint");
    setCurrentColor(colors[0]);
    setSettingsSheetOpen(false);

    const nextPan = { x: 0, y: 0 };
    scheduleTransform(nextPan, 1);
    setZoom(1);
    setPan(nextPan);
  };

  const beadCount = useMemo(() => {
    return grid.reduce(
      (acc, row) => {
        row.forEach((cell) => {
          acc.total++;

          if (cell.color !== baseColor) {
            acc.colors[cell.color] = (acc.colors[cell.color] || 0) + 1;
          }

          if (cell.zone) {
            acc.zones[cell.zone] = (acc.zones[cell.zone] || 0) + 1;
          }
        });

        return acc;
      },
      {
        total: 0,
        colors: {} as Record<string, number>,
        zones: {} as Record<string, number>,
      }
    );
  }, [grid]);

  const applyToolToCell = (r: number, c: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));

      if (!next[r] || !next[r][c]) return prev;

      if (activeTool === "paint") {
        next[r][c].color = currentColor;
      }

      if (activeTool === "erase") {
        next[r][c].color = baseColor;
        next[r][c].zone = null;
      }

      if (activeTool === "zone") {
        next[r][c].zone = selectedZone;
      }

      return next;
    });
  };

  const paintStripe = (r: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));

      if (!next[r]) return prev;

      next[r] = next[r].map((cell) => {
        if (activeTool === "stripe") {
          return {
            ...cell,
            zone: selectedZone,
          };
        }

        if (activeTool === "erase") {
          return {
            color: baseColor,
            zone: null,
          };
        }

        return cell;
      });

      return next;
    });
  };

  const handleCellClick = (r: number) => {
    if (activeTool === "stripe") {
      paintStripe(r);
    }
  };

  const startDrawing = (r: number, c: number) => {
    if (activeTool === "text" || activeTool === "stripe") return;
    if (pinchRef.current.isPinching) return;

    drawRef.current.isDrawing = true;
    drawRef.current.lastKey = `${r}-${c}`;
    applyToolToCell(r, c);
  };

  const continueDrawing = (r: number, c: number) => {
    if (!drawRef.current.isDrawing) return;
    if (activeTool === "text" || activeTool === "stripe") return;
    if (pinchRef.current.isPinching) return;

    const key = `${r}-${c}`;
    if (drawRef.current.lastKey === key) return;

    drawRef.current.lastKey = key;
    applyToolToCell(r, c);
  };

  const stopDrawing = () => {
    drawRef.current.isDrawing = false;
    drawRef.current.lastKey = null;
  };

  const handleBoardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boardRef.current) return;

    if (activeTool !== "text") {
      setSelectedNoteId(null);
      return;
    }

    if (!draftText.trim()) return;

    const rect = boardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - panRef.current.x) / totalScale;
    const y = (e.clientY - rect.top - panRef.current.y) / totalScale;

    const newNote: TextNote = {
      id: `${Date.now()}-${Math.random()}`,
      text: draftText,
      x,
      y,
      color: draftTextColor,
      fontSize: draftFontSize,
      rotation: draftRotation,
      fontWeight: draftBold ? 800 : 600,
    };

    setNotes((prev) => [...prev, newNote]);
    setSelectedNoteId(newNote.id);
    setIsPanelOpen(true);
  };

  const handleBoardTouchEnd = () => {
    stopDrawing();

    dragRef.current = {
      noteId: null,
      offsetX: 0,
      offsetY: 0,
      isTouch: false,
    };
  };

  const startNoteDrag = (
    clientX: number,
    clientY: number,
    id: string,
    isTouch: boolean
  ) => {
    if (!boardRef.current) return;

    const note = notes.find((item) => item.id === id);
    if (!note) return;

    const rect = boardRef.current.getBoundingClientRect();

    dragRef.current = {
      noteId: id,
      offsetX: (clientX - rect.left - panRef.current.x) / totalScale - note.x,
      offsetY: (clientY - rect.top - panRef.current.y) / totalScale - note.y,
      isTouch,
    };

    setSelectedNoteId(id);
    setActiveTool("text");
    setIsPanelOpen(true);
  };

  const handleNoteMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    id: string
  ) => {
    e.stopPropagation();
    startNoteDrag(e.clientX, e.clientY, id, false);
  };

  const handleNoteTouchStart = (
    e: React.TouchEvent<HTMLDivElement>,
    id: string
  ) => {
    e.stopPropagation();

    if (e.touches.length > 1) return;

    const touch = e.touches[0];
    if (!touch) return;

    startNoteDrag(touch.clientX, touch.clientY, id, true);
  };

  const moveSelectedNote = (clientX: number, clientY: number) => {
    if (!boardRef.current) return;
    if (!dragRef.current.noteId) return;

    const rect = boardRef.current.getBoundingClientRect();
    const x =
      (clientX - rect.left - panRef.current.x) / totalScale -
      dragRef.current.offsetX;
    const y =
      (clientY - rect.top - panRef.current.y) / totalScale -
      dragRef.current.offsetY;

    setNotes((prev) =>
      prev.map((note) =>
        note.id === dragRef.current.noteId
          ? {
              ...note,
              x,
              y,
            }
          : note
      )
    );
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.noteId) {
      moveSelectedNote(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    dragRef.current = {
      noteId: null,
      offsetX: 0,
      offsetY: 0,
      isTouch: false,
    };
    stopDrawing();
  };

  const handleBoardTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 1) return;

    const touch = e.touches[0];
    if (!touch) return;

    if (dragRef.current.noteId) {
      e.preventDefault();
      moveSelectedNote(touch.clientX, touch.clientY);
    }
  };

  const updateSelectedNote = (patch: Partial<TextNote>) => {
    if (!selectedNoteId) return;

    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedNoteId ? { ...note, ...patch } : note
      )
    );
  };

  const deleteSelectedNote = () => {
    if (!selectedNoteId) return;

    setNotes((prev) => prev.filter((note) => note.id !== selectedNoteId));
    setSelectedNoteId(null);
  };

  const duplicateSelectedNote = () => {
    if (!selectedNote) return;

    const duplicated: TextNote = {
      ...selectedNote,
      id: `${Date.now()}-${Math.random()}`,
      x: selectedNote.x + 24,
      y: selectedNote.y + 24,
    };

    setNotes((prev) => [...prev, duplicated]);
    setSelectedNoteId(duplicated.id);
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

    stopDrawing();

    dragRef.current = {
      noteId: null,
      offsetX: 0,
      offsetY: 0,
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
  };

  const renderSelectedTextEditor = () => {
    if (!selectedNote) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          value={selectedNote.text}
          onChange={(e) => updateSelectedNote({ text: e.target.value })}
          placeholder="Текст"
          style={inputStyle}
        />

        <div style={tabsRowStyle}>
          {textTabs.map((tab) => {
            const active = textTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => setTextTab(tab.key)}
                style={{
                  ...tabButtonStyle,
                  background: active
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.04)",
                  border: active
                    ? "1px solid rgba(255,255,255,0.14)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {textTab === "style" && (
          <>
            <div style={colorGridStyle}>
              {textColors.map((c) => (
                <button
                  key={c}
                  onClick={() => updateSelectedNote({ color: c })}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: c,
                    border:
                      selectedNote.color === c
                        ? "2px solid #fff"
                        : "1px solid rgba(255,255,255,0.18)",
                    boxShadow:
                      c === "#FFFFFF"
                        ? "inset 0 0 0 1px #8d8d8d"
                        : "none",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>

            <div style={rowStyle}>
              <button
                onClick={() =>
                  updateSelectedNote({
                    fontWeight: selectedNote.fontWeight === 800 ? 600 : 800,
                  })
                }
                style={chipButtonStyle}
              >
                <span style={{ fontWeight: 800 }}>B</span>
                {selectedNote.fontWeight === 800 ? "Жирный" : "Обычный"}
              </button>

              <button onClick={duplicateSelectedNote} style={chipButtonStyle}>
                ⧉ Дубль
              </button>

              <button
                onClick={deleteSelectedNote}
                style={{
                  ...chipButtonStyle,
                  color: "#ff8f8f",
                }}
              >
                Удалить
              </button>
            </div>
          </>
        )}

        {textTab === "size" && (
          <div style={sliderBlockStyle}>
            <div style={sliderHeaderStyle}>
              <span>Размер текста</span>
              <span>{selectedNote.fontSize}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={52}
              value={selectedNote.fontSize}
              onChange={(e) =>
                updateSelectedNote({ fontSize: Number(e.target.value) })
              }
              style={{ width: "100%" }}
            />
          </div>
        )}

        {textTab === "rotate" && (
          <div style={sliderBlockStyle}>
            <div style={sliderHeaderStyle}>
              <span>Поворот</span>
              <span>{selectedNote.rotation}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={selectedNote.rotation}
              onChange={(e) =>
                updateSelectedNote({ rotation: Number(e.target.value) })
              }
              style={{ width: "100%" }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderDraftTextEditor = () => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Текст заметки"
          style={inputStyle}
        />

        <div style={tabsRowStyle}>
          {textTabs.map((tab) => {
            const active = textTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => setTextTab(tab.key)}
                style={{
                  ...tabButtonStyle,
                  background: active
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.04)",
                  border: active
                    ? "1px solid rgba(255,255,255,0.14)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {textTab === "style" && (
          <>
            <div style={colorGridStyle}>
              {textColors.map((c) => (
                <button
                  key={c}
                  onClick={() => setDraftTextColor(c)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: c,
                    border:
                      draftTextColor === c
                        ? "2px solid #fff"
                        : "1px solid rgba(255,255,255,0.18)",
                    boxShadow:
                      c === "#FFFFFF"
                        ? "inset 0 0 0 1px #8d8d8d"
                        : "none",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>

            <div style={rowStyle}>
              <button
                onClick={() => setDraftBold((prev) => !prev)}
                style={chipButtonStyle}
              >
                <span style={{ fontWeight: 800 }}>B</span>
                {draftBold ? "Жирный" : "Обычный"}
              </button>
            </div>
          </>
        )}

        {textTab === "size" && (
          <div style={sliderBlockStyle}>
            <div style={sliderHeaderStyle}>
              <span>Размер текста</span>
              <span>{draftFontSize}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={52}
              value={draftFontSize}
              onChange={(e) => setDraftFontSize(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {textTab === "rotate" && (
          <div style={sliderBlockStyle}>
            <div style={sliderHeaderStyle}>
              <span>Поворот</span>
              <span>{draftRotation}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={draftRotation}
              onChange={(e) => setDraftRotation(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderToolOptions = () => {
    if (selectedNote) {
      return renderSelectedTextEditor();
    }

    if (activeTool === "paint") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={panelTitleStyle}>Цвет покраски</div>
          <div style={colorGridStyle}>
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setCurrentColor(c)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: c,
                  border:
                    currentColor === c
                      ? "2px solid #fff"
                      : "1px solid rgba(255,255,255,0.18)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
      );
    }

    if (activeTool === "zone" || activeTool === "stripe") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={panelTitleStyle}>
            {activeTool === "zone" ? "Выбор зоны" : "Полоса по зоне"}
          </div>

          <div style={zoneGridStyle}>
            {(Object.keys(zoneLabels) as ZoneType[]).map((zone) => {
              const active = selectedZone === zone;

              return (
                <button
                  key={zone}
                  onClick={() => setSelectedZone(zone)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: active
                      ? "1px solid rgba(255,255,255,0.14)"
                      : "1px solid rgba(255,255,255,0.07)",
                    background: active
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(255,255,255,0.03)",
                    color: "#fff",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    justifyContent: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: zoneColors[zone],
                      border: "1px solid rgba(255,255,255,0.20)",
                      flexShrink: 0,
                    }}
                  />
                  <span>{zoneLabels[zone]}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeTool === "text") {
      return renderDraftTextEditor();
    }

    if (activeTool === "erase") {
      return (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Нажимай или веди пальцем по бусинам, чтобы стереть цвет и зону.
        </div>
      );
    }

    return (
      <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
        Выбери инструмент снизу
      </div>
    );
  };

  const closeSettingsSheet = () => {
    setSettingsSheetOpen(false);
  };

  const renderSettingsFields = () => {
    return (
      <div style={sheetContentStackStyle}>
        <div style={sheetTitleStyle}>Настройка сетки</div>

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
            padding: "0 10px 10px",
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
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 10,
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

            <div style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
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

              {renderSettingsFields()}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={pageStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div
        style={{
          minHeight: "100vh",
          padding: 18,
          paddingBottom: 250,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxSizing: "border-box",
          width: "100%",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 12,
            flexWrap: "wrap",
            padding: "14px 16px",
            borderRadius: 22,
            background: "rgba(28, 30, 36, 0.72)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(22px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Сетка
            </div>

            <button
              onClick={() => {
                setDraftSettings(settings);
                setSettingsSheetOpen(true);
              }}
              style={secondaryActionStyle}
            >
              Параметры
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <div style={topInfoChipStyle}>
              {settings.width}×{settings.height} крест.
            </div>

            <div style={topInfoChipStyle}>{Math.round(zoom * 100)}%</div>

            <button onClick={() => zoomTo(zoomRef.current * 0.9)} style={zoomActionStyle}>
              −
            </button>

            <button onClick={() => zoomTo(zoomRef.current * 1.1)} style={zoomActionStyle}>
              +
            </button>

            <button onClick={resetView} style={secondaryActionStyle}>
              Fit
            </button>
          </div>
        </div>

        <div
          style={{
            background: "rgba(28, 30, 36, 0.66)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: 22,
            borderRadius: 28,
            overflow: "hidden",
            maxWidth: "100%",
            width: "100%",
            boxShadow:
              "0 16px 44px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.03)",
            backdropFilter: "blur(22px)",
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 20,
              background: "rgba(18, 20, 25, 0.82)",
              border: "1px solid rgba(255,255,255,0.05)",
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
                borderRadius: 20,
                background:
                  "radial-gradient(circle at top, rgba(255,255,255,0.05), transparent 45%), rgba(14,16,21,0.92)",
                border: "1px solid rgba(255,255,255,0.05)",
                touchAction: "none",
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
                }}
              >
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
                Щипок двумя пальцами — zoom
              </div>

              <div
                ref={boardRef}
                onClick={handleBoardClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchMove={handleBoardTouchMove}
                onTouchEnd={handleBoardTouchEnd}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  touchAction: "none",
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
                      const isBase = cell.color === baseColor;

                      return (
                        <div
                          key={`${r}-${c}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(r);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            startDrawing(r, c);
                          }}
                          onMouseEnter={() => {
                            continueDrawing(r, c);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();

                            if (e.touches.length > 1) return;

                            if (activeTool === "stripe") {
                              paintStripe(r);
                              return;
                            }

                            if (activeTool === "text") return;

                            startDrawing(r, c);
                          }}
                          onTouchMove={(e) => {
                            e.stopPropagation();

                            if (e.touches.length > 1) return;

                            continueDrawing(r, c);
                          }}
                          style={{
                            position: "absolute",
                            left,
                            top,
                            width: bead,
                            height: bead,
                            borderRadius: "50%",
                            border:
                              cell.zone !== null
                                ? "1.5px solid rgba(255,255,255,0.65)"
                                : "1px solid rgba(0,0,0,0.22)",
                            background: isBase
                              ? "linear-gradient(180deg, #fafafa 0%, #e9eaec 100%)"
                              : cell.color,
                            boxShadow:
                              cell.zone !== null
                                ? `0 0 0 5px ${zoneColors[cell.zone]}, inset 0 1px 2px rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.14)`
                                : "inset 0 1px 2px rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.12)",
                            cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        />
                      );
                    });
                  })}

                  {notes.map((note) => {
                    const isSelected = note.id === selectedNoteId;

                    return (
                      <div
                        key={note.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNoteId(note.id);
                          setActiveTool("text");
                          setIsPanelOpen(true);
                        }}
                        onMouseDown={(e) => handleNoteMouseDown(e, note.id)}
                        onTouchStart={(e) => handleNoteTouchStart(e, note.id)}
                        style={{
                          position: "absolute",
                          left: note.x,
                          top: note.y,
                          transform: `translate(-50%, -50%) rotate(${note.rotation}deg)`,
                          padding: "7px 11px",
                          borderRadius: 12,
                          background: "rgba(20,22,28,0.92)",
                          color: note.color,
                          fontSize: note.fontSize,
                          fontWeight: note.fontWeight,
                          cursor: "move",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          border: isSelected
                            ? "1px solid rgba(255,255,255,0.18)"
                            : "1px solid rgba(255,255,255,0.08)",
                          boxShadow: isSelected
                            ? "0 6px 18px rgba(0,0,0,0.22)"
                            : "0 4px 12px rgba(0,0,0,0.16)",
                          textShadow:
                            note.color === "#FFFFFF"
                              ? "0 1px 2px rgba(0,0,0,0.6)"
                              : "0 1px 2px rgba(0,0,0,0.45)",
                          touchAction: "none",
                        }}
                      >
                        {note.text}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            justifyContent: "center",
            color: "#fff",
            width: "100%",
            maxWidth: 1200,
          }}
        >
          <div style={statsCardStyle}>
            <p style={statsTitleStyle}>Всего бусин: {beadCount.total}</p>
            <div style={statsListStyle}>
              {Object.entries(beadCount.colors).length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                  Пока нет окрашенных бусин
                </div>
              )}

              {Object.entries(beadCount.colors).map(([color, count]) => (
                <div key={color} style={statsRowStyle}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      background: color,
                      borderRadius: "50%",
                      display: "inline-block",
                      border: "1px solid rgba(255,255,255,0.20)",
                    }}
                  />
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={statsCardStyle}>
            <p style={statsTitleStyle}>По зонам</p>
            <div style={statsListStyle}>
              {Object.entries(beadCount.zones).length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                  Пока нет размеченных зон
                </div>
              )}

              {Object.entries(beadCount.zones).map(([zone, count]) => (
                <div key={zone} style={statsRowStyle}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      display: "inline-block",
                      background: zoneColors[zone as ZoneType],
                      border: "1px solid rgba(255,255,255,0.20)",
                    }}
                  />
                  <span>
                    {zoneLabels[zone as ZoneType]}: {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            position: "relative",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              margin: "0 12px 10px",
              transform: isPanelOpen
                ? "translateY(0) scale(1)"
                : "translateY(18px) scale(0.985)",
              opacity: isPanelOpen ? 1 : 0,
              transition:
                "transform 0.22s ease, opacity 0.22s ease, visibility 0.22s ease",
              visibility: isPanelOpen ? "visible" : "hidden",
              background: "rgba(28, 30, 36, 0.86)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 22,
              boxShadow: "0 -10px 26px rgba(0,0,0,0.22)",
              padding: 14,
              maxHeight: 250,
              overflowY: "auto",
            }}
          >
            {renderToolOptions()}
          </div>

          <div
            style={{
              pointerEvents: "auto",
              margin: "0 12px",
              padding: "10px 14px calc(12px + env(safe-area-inset-bottom))",
              background: "rgba(28, 30, 36, 0.92)",
              backdropFilter: "blur(20px)",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 -8px 24px rgba(0,0,0,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <button
                onClick={() => setIsPanelOpen((prev) => !prev)}
                style={{
                  width: 46,
                  height: 18,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {isPanelOpen ? "⌄" : "⌃"}
              </button>
            </div>

            <div
              style={{
                overflowX: "auto",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 14,
                paddingBottom: 2,
              }}
            >
              {tools.map((tool) => {
                const isActive = activeTool === tool.key && !selectedNoteId;

                return (
                  <button
                    key={tool.key}
                    onClick={() => {
                      setSelectedNoteId(null);
                      setActiveTool(tool.key);
                      setIsPanelOpen(true);
                    }}
                    style={{
                      flexShrink: 0,
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                      minWidth: 60,
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 17,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isActive
                          ? "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.10) 100%)"
                          : "rgba(255,255,255,0.04)",
                        border: isActive
                          ? "1px solid rgba(255,255,255,0.16)"
                          : "1px solid rgba(255,255,255,0.06)",
                        fontSize: tool.key === "text" ? 21 : 18,
                        fontWeight: tool.key === "text" ? 800 : 600,
                        transition: "all 0.18s ease",
                        boxShadow: isActive
                          ? "0 10px 22px rgba(0,0,0,0.20)"
                          : "none",
                      }}
                    >
                      {tool.icon}
                    </span>

                    <span
                      style={{
                        minHeight: 16,
                        fontSize: 11,
                        opacity: isActive ? 1 : 0.68,
                        whiteSpace: "nowrap",
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
                      {tool.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {renderSettingsSheet()}
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  background:
    "radial-gradient(circle at top left, rgba(96,132,255,0.16), transparent 26%), radial-gradient(circle at top right, rgba(129,92,255,0.12), transparent 24%), linear-gradient(180deg, #121318 0%, #0c0e12 100%)",
  position: "relative",
  overflow: "hidden",
};

const topGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -100,
  left: -90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(65, 125, 255, 0.16)",
  filter: "blur(90px)",
  zIndex: 0,
};

const sideGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: 60,
  right: -90,
  width: 280,
  height: 280,
  borderRadius: "50%",
  background: "rgba(167, 94, 255, 0.14)",
  filter: "blur(90px)",
  zIndex: 0,
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

const secondaryActionStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const zoomActionStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
};

const floatingZoomButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(22,24,30,0.84)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  backdropFilter: "blur(16px)",
};

const ghostTextButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#64A8FF",
  fontSize: 15,
  cursor: "pointer",
  padding: 0,
};

const topInfoChipStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.84)",
  fontSize: 13,
};

const statsCardStyle: React.CSSProperties = {
  minWidth: 240,
  padding: 14,
  borderRadius: 18,
  background: "rgba(28, 30, 36, 0.66)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  backdropFilter: "blur(16px)",
};

const statsTitleStyle: React.CSSProperties = {
  margin: "0 0 12px 0",
  fontSize: 14,
  fontWeight: 700,
  color: "rgba(255,255,255,0.92)",
};

const statsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-start",
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.76)",
  fontSize: 13,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
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

const panelTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  opacity: 0.92,
};

const tabsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tabButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const chipButtonStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const sliderBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const sliderHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "#fff",
  fontSize: 14,
};

const colorGridStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const zoneGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
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

const sheetTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.03em",
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

export default GridScreen;