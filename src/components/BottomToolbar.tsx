import React, { useEffect, useMemo, useState } from "react";

type Tool = "move" | "brush" | "erase" | "add" | "deactivate";
type Panel = Tool | "color";

interface Props {
  active: Tool;
  activeColor: string;
  toolSize: number;
  paletteColors: string[];
  onChange: (tool: Tool) => void;
  onToolSizeChange: (size: number) => void;
  onSelectColor: (color: string) => void;
  onOpenPalette?: () => void;
}

type ToolbarItem = {
  key: Tool | "color";
  label: string;
  icon: string;
  hasSettings: boolean;
};

const MIN_TOOL_SIZE = 1;
const MAX_TOOL_SIZE = 8;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const tools: ToolbarItem[] = [
  { key: "brush", label: "Кисть", icon: "✎", hasSettings: true },
  { key: "erase", label: "Ластик", icon: "⌫", hasSettings: true },
  { key: "move", label: "Двигать", icon: "✥", hasSettings: false },
  { key: "color", label: "Цвет", icon: "●", hasSettings: true },
  { key: "deactivate", label: "Скрыть", icon: "○", hasSettings: true },
  { key: "add", label: "Вернуть", icon: "+", hasSettings: true },
];

const panelLabels: Record<Panel, string> = {
  brush: "Кисть",
  erase: "Ластик",
  move: "Двигать",
  color: "Цвет",
  deactivate: "Скрыть",
  add: "Вернуть",
};

const panelIcons: Record<Panel, string> = {
  brush: "✎",
  erase: "⌫",
  move: "✥",
  color: "●",
  deactivate: "○",
  add: "+",
};

const toolsWithSize = new Set<Panel>(["brush", "erase", "deactivate", "add"]);

const BottomToolbar: React.FC<Props> = ({
  active,
  activeColor,
  toolSize,
  paletteColors,
  onChange,
  onToolSizeChange,
  onSelectColor,
}) => {
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    if (active === "move") {
      setPanel(null);
    }
  }, [active]);

  const normalizedToolSize = useMemo(() => {
    return clamp(Math.round(toolSize), MIN_TOOL_SIZE, MAX_TOOL_SIZE);
  }, [toolSize]);

  const setSize = (nextSize: number) => {
    onToolSizeChange(clamp(Math.round(nextSize), MIN_TOOL_SIZE, MAX_TOOL_SIZE));
  };

  const handleToolClick = (key: Tool | "color") => {
    if (key === "color") {
      onChange("brush");
      setPanel("color");
      return;
    }

    onChange(key);

    if (key === "move") {
      setPanel(null);
      return;
    }

    setPanel(key);
  };

  const showSizeControls = panel !== null && toolsWithSize.has(panel);
  const showColorControls = panel === "brush" || panel === "color";

  return (
    <div
      style={toolbarWrap}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      onTouchMove={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {panel === null ? (
        <div style={toolsRow}>
          {tools.map((item) => {
            const isActive =
              item.key === "color" ? active === "brush" : active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                style={{
                  ...toolButton,
                  ...(isActive ? activeToolButton : null),
                }}
                onClick={() => handleToolClick(item.key)}
              >
                <span
                  style={{
                    ...toolIcon,
                    ...(item.key === "color"
                      ? {
                          background: activeColor,
                          color: "transparent",
                          borderColor:
                            activeColor === "#ffffff"
                              ? "rgba(0,0,0,0.18)"
                              : "rgba(255,255,255,0.28)",
                        }
                      : null),
                  }}
                >
                  {item.icon}
                </span>
                <span style={toolLabel}>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={settingsRow}>
          <button
            type="button"
            style={backButton}
            onClick={() => setPanel(null)}
            aria-label="Назад к инструментам"
          >
            ←
          </button>

          <div style={activeToolPill}>
            <span
              style={{
                ...activeToolIcon,
                ...(panel === "color"
                  ? {
                      background: activeColor,
                      color: "transparent",
                      borderColor:
                        activeColor === "#ffffff"
                          ? "rgba(0,0,0,0.18)"
                          : "rgba(255,255,255,0.28)",
                    }
                  : null),
              }}
            >
              {panelIcons[panel]}
            </span>
            <span>{panelLabels[panel]}</span>
          </div>

          {showSizeControls && (
            <div style={sizeControl}>
              <button
                type="button"
                style={roundButton}
                onClick={() => setSize(normalizedToolSize - 1)}
                disabled={normalizedToolSize <= MIN_TOOL_SIZE}
              >
                −
              </button>

              <div style={sizeValueWrap}>
                <div style={sizeLabel}>Размер</div>
                <div style={sizeValue}>{normalizedToolSize}</div>
              </div>

              <button
                type="button"
                style={roundButton}
                onClick={() => setSize(normalizedToolSize + 1)}
                disabled={normalizedToolSize >= MAX_TOOL_SIZE}
              >
                +
              </button>
            </div>
          )}

          {showColorControls && (
            <div style={colorsRow}>
              {paletteColors.map((color) => {
                const isSelected = color.toLowerCase() === activeColor.toLowerCase();

                return (
                  <button
                    key={color}
                    type="button"
                    style={{
                      ...colorButton,
                      background: color,
                      border:
                        color === "#ffffff"
                          ? "1px solid rgba(0,0,0,0.14)"
                          : "1px solid rgba(255,255,255,0.12)",
                      boxShadow: isSelected
                        ? "0 0 0 3px rgba(139,92,246,0.42)"
                        : "none",
                    }}
                    onClick={() => {
                      onSelectColor(color);
                      onChange("brush");
                    }}
                    aria-label={`Выбрать цвет ${color}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BottomToolbar;

const toolbarWrap: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
  zIndex: 30,
  minHeight: 74,
  borderRadius: 24,
  background: "rgba(17, 18, 24, 0.78)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 18px 46px rgba(0,0,0,0.36)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  boxSizing: "border-box",
  padding: 8,
  overflow: "hidden",
  touchAction: "pan-x",
};

const toolsRow: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 8,
  overflowX: "auto",
  overflowY: "hidden",
  scrollbarWidth: "none",
  WebkitOverflowScrolling: "touch",
};

const toolButton: React.CSSProperties = {
  minWidth: 72,
  height: 58,
  border: 0,
  borderRadius: 18,
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.72)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: "inherit",
};

const activeToolButton: React.CSSProperties = {
  background: "rgba(139,92,246,0.96)",
  color: "#ffffff",
  boxShadow: "0 10px 24px rgba(139,92,246,0.34)",
};

const toolIcon: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
  lineHeight: 1,
  boxSizing: "border-box",
};

const toolLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const settingsRow: React.CSSProperties = {
  minHeight: 58,
  display: "flex",
  alignItems: "center",
  gap: 8,
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
  scrollbarWidth: "none",
};

const backButton: React.CSSProperties = {
  width: 44,
  height: 44,
  border: 0,
  borderRadius: 16,
  background: "rgba(255,255,255,0.10)",
  color: "#ffffff",
  fontSize: 22,
  fontWeight: 900,
  cursor: "pointer",
  flexShrink: 0,
};

const activeToolPill: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 900,
  flexShrink: 0,
};

const activeToolIcon: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
  boxSizing: "border-box",
};

const sizeControl: React.CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 8px",
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  flexShrink: 0,
};

const roundButton: React.CSSProperties = {
  width: 32,
  height: 32,
  border: 0,
  borderRadius: 999,
  background: "rgba(255,255,255,0.13)",
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
};

const sizeValueWrap: React.CSSProperties = {
  minWidth: 46,
  textAlign: "center",
  lineHeight: 1,
};

const sizeLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: "rgba(255,255,255,0.54)",
  marginBottom: 3,
};

const sizeValue: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#ffffff",
};

const colorsRow: React.CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 8px",
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  flexShrink: 0,
};

const colorButton: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  padding: 0,
  cursor: "pointer",
  flexShrink: 0,
};
