import React, { useMemo, useRef, useState } from "react";

interface Props {
  width: number;
  height: number;
  wallHeight: number;
  beadSize: string;
  onBack: () => void;
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
const shortRowShift = xStep / 2;
const yStep = Math.sqrt(bead * bead - shortRowShift * shortRowShift);

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

const GridScreen: React.FC<Props> = ({
  width,
  height,
  wallHeight,
  beadSize,
  onBack,
}) => {
  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? width - 1 : width;
  };

  const createGrid = () =>
    Array.from({ length: height }, (_, rowIndex) =>
      Array.from({ length: getRowLength(rowIndex) }, () => ({
        color: baseColor,
        zone: null,
      }))
    );

  const [grid, setGrid] = useState<Cell[][]>(createGrid());
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

  const boardRef = useRef<HTMLDivElement | null>(null);

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

  const selectedNote = notes.find((note) => note.id === selectedNoteId) || null;

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

  const toggleCell = (r: number, c: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));

      if (!next[r] || !next[r][c]) return prev;

      if (activeTool === "paint") {
        next[r][c].color =
          next[r][c].color === currentColor ? baseColor : currentColor;
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

  const handleCellClick = (r: number, c: number) => {
    if (activeTool === "stripe") {
      paintStripe(r);
      return;
    }

    toggleCell(r, c);
  };

  const startDrawing = (r: number, c: number) => {
    if (activeTool === "text" || activeTool === "stripe") return;

    drawRef.current.isDrawing = true;
    drawRef.current.lastKey = `${r}-${c}`;
    applyToolToCell(r, c);
  };

  const continueDrawing = (r: number, c: number) => {
    if (!drawRef.current.isDrawing) return;
    if (activeTool === "text" || activeTool === "stripe") return;

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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
      offsetX: clientX - rect.left - note.x,
      offsetY: clientY - rect.top - note.y,
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
    const touch = e.touches[0];
    if (!touch) return;
    startNoteDrag(touch.clientX, touch.clientY, id, true);
  };

  const moveSelectedNote = (clientX: number, clientY: number) => {
    if (!boardRef.current) return;
    if (!dragRef.current.noteId) return;

    const rect = boardRef.current.getBoundingClientRect();
    const x = clientX - rect.left - dragRef.current.offsetX;
    const y = clientY - rect.top - dragRef.current.offsetY;

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

  const boardWidth = (width - 1) * xStep + bead;
  const boardHeight = (height - 1) * yStep + bead;

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

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #1b1d23 0%, #15171c 45%, #111318 100%)",
        padding: 20,
        paddingBottom: 250,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        boxSizing: "border-box",
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
          padding: "12px 14px",
          borderRadius: 18,
          background: "rgba(28, 30, 36, 0.78)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.22)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={onBack}
            style={{
              padding: "9px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ← Назад
          </button>

          <div
            style={{
              padding: "9px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.88)",
              fontSize: 14,
            }}
          >
            Bead Editor
          </div>
        </div>

        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.72)",
            fontSize: 14,
          }}
        >
          {width}×{height} · стенка {wallHeight} · бусина {beadSize}
        </p>
      </div>

      <div
        style={{
          background: "rgba(28, 30, 36, 0.76)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: 22,
          borderRadius: 24,
          overflow: "auto",
          maxWidth: "100%",
          boxShadow:
            "0 14px 40px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.03)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background: "rgba(18, 20, 25, 0.82)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            ref={boardRef}
            onClick={handleBoardClick}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={handleBoardTouchMove}
            onTouchEnd={handleBoardTouchEnd}
            style={{
              position: "relative",
              width: boardWidth,
              height: boardHeight,
              touchAction: "none",
            }}
          >
            {grid.map((row, r) => {
              const rowLength = getRowLength(r);
              const rowStartX = rowLength === width ? 0 : xStep / 2;

              return row.map((cell, c) => {
                const left = rowStartX + c * xStep;
                const top = r * yStep;
                const isBase = cell.color === baseColor;

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCellClick(r, c);
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
                      if (activeTool === "stripe") {
                        paintStripe(r);
                        return;
                      }
                      if (activeTool === "text") return;
                      startDrawing(r, c);
                    }}
                    onTouchMove={(e) => {
                      e.stopPropagation();
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
            maxWidth: 820,
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
              borderRadius: 20,
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
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
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
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isActive
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(255,255,255,0.04)",
                        border: isActive
                          ? "1px solid rgba(255,255,255,0.14)"
                          : "1px solid rgba(255,255,255,0.06)",
                        fontSize: tool.key === "text" ? 21 : 18,
                        fontWeight: tool.key === "text" ? 800 : 600,
                        transition: "all 0.18s ease",
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
    </div>
  );
};

const statsCardStyle: React.CSSProperties = {
  minWidth: 240,
  padding: 14,
  borderRadius: 16,
  background: "rgba(28, 30, 36, 0.72)",
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

export default GridScreen;