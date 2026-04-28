import React, { useRef, useState } from "react";

type Tool =
  | "move"
  | "brush"
  | "erase"
  | "add"
  | "deactivate"
  | "ruler"
  | "shapes";

type SettingsTool = Exclude<Tool, "move">;
type ShapeType = "line" | "rect" | "circle";

interface Props {
  active: Tool;
  activeColor: string;
  toolSize: number;
  rulerVisible: boolean;
  shapeType: ShapeType;
  onToolSizeChange: (size: number) => void;
  onChange: (tool: Tool) => void;
  onOpenPalette: () => void;
  onToggleRulerVisible: () => void;
  onShapeTypeChange: (shapeType: ShapeType) => void;
  onDeleteShape: () => void;
}

const TOOL_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const toolHasSettings = (tool: Tool): tool is SettingsTool => tool !== "move";

const BottomToolbar: React.FC<Props> = ({
  active,
  activeColor,
  toolSize,
  rulerVisible,
  shapeType,
  onToolSizeChange,
  onChange,
  onOpenPalette,
  onToggleRulerVisible,
  onShapeTypeChange,
  onDeleteShape,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [settingsTool, setSettingsTool] = useState<SettingsTool | null>(null);
  const [sizePickerOpen, setSizePickerOpen] = useState(false);

  const dragRef = useRef({
    isDown: false,
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    dragRef.current = {
      isDown: true,
      isDragging: false,
      startX: event.clientX,
      startScrollLeft: scrollElement.scrollLeft,
    };

    scrollElement.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    const drag = dragRef.current;

    if (!scrollElement || !drag.isDown) return;

    const diffX = event.clientX - drag.startX;

    if (Math.abs(diffX) > 4) {
      drag.isDragging = true;
    }

    if (!drag.isDragging) return;

    scrollElement.scrollLeft = drag.startScrollLeft - diffX;

    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    scrollElement?.releasePointerCapture?.(event.pointerId);

    window.setTimeout(() => {
      dragRef.current = {
        isDown: false,
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
      };
    }, 0);

    event.stopPropagation();
  };

  const handleToolClick = (nextTool: Tool) => {
    if (dragRef.current.isDragging) return;

    onChange(nextTool);
    setSizePickerOpen(false);

    if (toolHasSettings(nextTool)) {
      setSettingsTool(nextTool);
      return;
    }

    setSettingsTool(null);
  };

  const handleBackToTools = () => {
    setSettingsTool(null);
    setSizePickerOpen(false);
  };

  const handlePaletteClick = () => {
    if (dragRef.current.isDragging) return;
    setSizePickerOpen(false);
    onOpenPalette();
  };

  const handleShapeTypeClick = (nextShapeType: ShapeType) => {
    if (dragRef.current.isDragging) return;
    setSizePickerOpen(false);
    onShapeTypeChange(nextShapeType);
  };

  const handleSizeButtonClick = () => {
    if (dragRef.current.isDragging) return;
    setSizePickerOpen((prev) => !prev);
  };

  const handleSizePresetClick = (size: number) => {
    onToolSizeChange(size);
    setSizePickerOpen(false);
  };

  const shouldShowSizeButton =
    settingsTool !== null && settingsTool !== "ruler" && settingsTool !== "shapes";

  return (
    <div style={wrapper}>
      {sizePickerOpen && shouldShowSizeButton ? (
        <div style={floatingSizePanel}>
          <div style={floatingSizeTitle}>Размер</div>

          <div style={sizePresetGroup}>
            {TOOL_SIZE_OPTIONS.map((size) => {
              const activeSize = toolSize === size;

              return (
                <button
                  key={size}
                  type="button"
                  style={{
                    ...sizePresetButton,
                    ...(activeSize ? sizePresetButtonActive : null),
                  }}
                  onClick={() => handleSizePresetClick(size)}
                  aria-label={`Размер ${size}`}
                  title={`Размер ${size}`}
                >
                  <span
                    style={{
                      ...sizePreviewDot,
                      width: 8 + size * 2,
                      height: 8 + size * 2,
                      opacity: activeSize ? 1 : 0.72,
                    }}
                  />
                  <span style={sizePresetText}>{size}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="bottom-toolbar-scroll"
        style={scrollArea}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {settingsTool ? (
          <div className="bottom-toolbar-track" style={settingsGroup}>
            <button
              type="button"
              style={backButton}
              onClick={handleBackToTools}
              aria-label="Назад к инструментам"
              title="Назад"
            >
              <BackIcon />
            </button>

            <div style={activeToolBadge}>
              {getToolIcon(settingsTool)}
              <span style={activeToolText}>{getToolName(settingsTool)}</span>
            </div>

            {settingsTool === "ruler" ? (
              <button
                type="button"
                style={wideActionButton}
                onClick={onToggleRulerVisible}
                aria-label={rulerVisible ? "Убрать линейку" : "Показать линейку"}
                title={rulerVisible ? "Убрать" : "Показать"}
              >
                {rulerVisible ? "Убрать" : "Показать"}
              </button>
            ) : null}

            {settingsTool === "shapes" ? (
              <>
                <ShapeButton
                  label="Линия"
                  active={shapeType === "line"}
                  onClick={() => handleShapeTypeClick("line")}
                >
                  <LineShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Прямоугольник"
                  active={shapeType === "rect"}
                  onClick={() => handleShapeTypeClick("rect")}
                >
                  <RectShapeIcon />
                </ShapeButton>

                <ShapeButton
                  label="Круг"
                  active={shapeType === "circle"}
                  onClick={() => handleShapeTypeClick("circle")}
                >
                  <CircleShapeIcon />
                </ShapeButton>

                <button
                  type="button"
                  style={wideActionButton}
                  onClick={onDeleteShape}
                  aria-label="Удалить фигуру"
                  title="Удалить"
                >
                  Удалить
                </button>

                <button
                  type="button"
                  style={colorButton}
                  onClick={handlePaletteClick}
                  aria-label="Выбрать цвет"
                  title="Цвет"
                >
                  <span style={{ ...colorDot, background: activeColor }} />
                  <PaletteIcon />
                </button>
              </>
            ) : null}

            {shouldShowSizeButton ? (
              <>
                <button
                  type="button"
                  style={{
                    ...compactActionButton,
                    ...(sizePickerOpen ? compactActionButtonActive : null),
                  }}
                  onClick={handleSizeButtonClick}
                  aria-label="Размер инструмента"
                  title="Размер"
                >
                  Размер {toolSize}
                </button>

                {settingsTool === "brush" ? (
                  <button
                    type="button"
                    style={colorButton}
                    onClick={handlePaletteClick}
                    aria-label="Выбрать цвет"
                    title="Цвет"
                  >
                    <span style={{ ...colorDot, background: activeColor }} />
                    <PaletteIcon />
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="bottom-toolbar-track" style={toolsGroup}>
            <ToolButton
              label="Кисть"
              active={active === "brush"}
              onClick={() => handleToolClick("brush")}
            >
              <PencilIcon />
            </ToolButton>

            <ToolButton
              label="Активировать кружок"
              active={active === "add"}
              onClick={() => handleToolClick("add")}
            >
              <AddCircleIcon />
            </ToolButton>

            <ToolButton
              label="Сделать кружок неактивным"
              active={active === "deactivate"}
              onClick={() => handleToolClick("deactivate")}
            >
              <InactiveCircleIcon />
            </ToolButton>

            <ToolButton
              label="Ластик"
              active={active === "erase"}
              onClick={() => handleToolClick("erase")}
            >
              <EraserIcon />
            </ToolButton>

            <ToolButton
              label="Двигать"
              active={active === "move"}
              onClick={() => handleToolClick("move")}
            >
              <MoveIcon />
            </ToolButton>

            <ToolButton
              label="Линейка"
              active={active === "ruler"}
              onClick={() => handleToolClick("ruler")}
            >
              <RulerIcon />
            </ToolButton>

            <ToolButton
              label="Фигуры"
              active={active === "shapes"}
              onClick={() => handleToolClick("shapes")}
            >
              <ShapesIcon />
            </ToolButton>

            <button
              type="button"
              style={{
                ...toolButton,
                ...paletteButton,
              }}
              onClick={handlePaletteClick}
              aria-label="Цвет"
              title="Цвет"
            >
              <span style={{ ...smallColorDot, background: activeColor }} />
              <PaletteIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomToolbar;

const getToolName = (tool: SettingsTool) => {
  switch (tool) {
    case "brush":
      return "Кисть";
    case "erase":
      return "Ластик";
    case "add":
      return "Вернуть";
    case "deactivate":
      return "Скрыть";
    case "ruler":
      return "Линейка";
    case "shapes":
      return "Фигуры";
  }
};

const getToolIcon = (tool: SettingsTool) => {
  switch (tool) {
    case "brush":
      return <PencilIcon />;
    case "erase":
      return <EraserIcon />;
    case "add":
      return <AddCircleIcon />;
    case "deactivate":
      return <InactiveCircleIcon />;
    case "ruler":
      return <RulerIcon />;
    case "shapes":
      return <ShapesIcon />;
  }
};

const ToolButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      ...toolButton,
      background: active
        ? "linear-gradient(135deg, #d9825f, #b85d6a)"
        : "rgba(255,255,255,0.08)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
      boxShadow: active ? "0 10px 24px rgba(208,138,106,0.28)" : "none",
      transform: active ? "translateY(-2px)" : "translateY(0)",
    }}
  >
    {children}
  </button>
);

const ShapeButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      ...shapeButton,
      background: active
        ? "linear-gradient(135deg, #d9825f, #b85d6a)"
        : "rgba(255,255,255,0.08)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.82)",
      boxShadow: active ? "0 10px 24px rgba(208,138,106,0.22)" : "none",
    }}
  >
    {children}
  </button>
);

const BackIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path
      d="M17.5 7L10.5 14L17.5 21"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true">
    <path
      d="M7.1 21.9L8.45 16.35L19.75 5.05C20.72 4.08 22.28 4.08 23.25 5.05L24 5.8C24.97 6.77 24.97 8.33 24 9.3L12.7 20.6L7.1 21.9Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M17.9 6.95L22.1 11.15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6.4 24.1H22.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const AddCircleIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <circle cx="15.5" cy="15.5" r="9.8" stroke="currentColor" strokeWidth="2.35" />
    <path d="M15.5 10.8V20.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M10.8 15.5H20.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const InactiveCircleIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <circle
      cx="15.5"
      cy="15.5"
      r="9.8"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeDasharray="3.6 3.6"
    />
    <path d="M11.2 19.8L19.8 11.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const EraserIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
    <path
      d="M5.9 17.65L15.75 7.8C17.02 6.53 19.08 6.53 20.35 7.8L22.2 9.65C23.47 10.92 23.47 12.98 22.2 14.25L13.3 23.15H8.9L5.9 20.15C5.2 19.45 5.2 18.35 5.9 17.65Z"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12.55 11L19 17.45" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M13.3 23.15H24.1" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const MoveIcon = () => (
  <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true">
    <path d="M10.1 4.8V10.1H4.8" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.9 4.8V10.1H24.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.1 24.2V18.9H4.8" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.9 24.2V18.9H24.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.3 10.3L6.2 6.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M18.7 10.3L22.8 6.2" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M10.3 18.7L6.2 22.8" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
    <path d="M18.7 18.7L22.8 22.8" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" />
  </svg>
);

const RulerIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <path
      d="M6.4 20.9L20.9 6.4L24.6 10.1L10.1 24.6L6.4 20.9Z"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinejoin="round"
    />
    <path d="M10.2 17.2L12.4 19.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M13 14.4L14.6 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15.8 11.6L18 13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ShapesIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <rect
      x="6.8"
      y="7.2"
      width="10"
      height="10"
      rx="2.6"
      stroke="currentColor"
      strokeWidth="2.25"
    />
    <circle cx="20.8" cy="19.7" r="5.2" stroke="currentColor" strokeWidth="2.25" />
    <path d="M8.2 23.7L14.8 17.1" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
  </svg>
);

const LineShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M7 21L21 7" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
  </svg>
);

const RectShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="6.8" y="7.8" width="14.4" height="12.4" rx="2.4" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

const CircleShapeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="7.2" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

const PaletteIcon = () => (
  <svg width="31" height="31" viewBox="0 0 31 31" fill="none" aria-hidden="true">
    <path
      d="M15.5 5.1C9.75 5.1 5.1 9.35 5.1 14.6C5.1 19.85 9.35 24.9 15.05 24.9H16.2C17.3 24.9 18.05 23.78 17.62 22.78C17.15 21.65 17.95 20.4 19.18 20.4H20.55C23.58 20.4 25.9 18 25.9 15C25.9 9.55 21.25 5.1 15.5 5.1Z"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="10.9" cy="13.1" r="1.55" fill="currentColor" />
    <circle cx="14.9" cy="10.65" r="1.55" fill="currentColor" />
    <circle cx="19.25" cy="12.05" r="1.55" fill="currentColor" />
    <circle cx="12.9" cy="17.25" r="1.55" fill="currentColor" />
  </svg>
);

const wrapper: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 40,
  minHeight: 78,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  padding: 10,
  borderRadius: 28,
  background: "rgba(27,29,34,0.86)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
  overflow: "visible",
  pointerEvents: "auto",
};

const scrollArea: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  touchAction: "pan-x",
  WebkitOverflowScrolling: "touch",
  overscrollBehaviorX: "contain",
  overscrollBehaviorY: "none",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  cursor: "grab",
};

const toolsGroup: React.CSSProperties = {
  width: "max-content",
  minWidth: "max-content",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px 0 2px",
  flexWrap: "nowrap",
};

const settingsGroup: React.CSSProperties = {
  width: "max-content",
  minWidth: "max-content",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px 0 2px",
  flexWrap: "nowrap",
};

const toolButton: React.CSSProperties = {
  flex: "0 0 58px",
  width: 58,
  minWidth: 58,
  height: 58,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 22,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
  color: "rgba(255,255,255,0.82)",
  background: "rgba(255,255,255,0.08)",
  WebkitTapHighlightColor: "transparent",
};

const shapeButton: React.CSSProperties = {
  flex: "0 0 52px",
  width: 52,
  minWidth: 52,
  height: 52,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 19,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
  color: "rgba(255,255,255,0.82)",
  background: "rgba(255,255,255,0.08)",
  WebkitTapHighlightColor: "transparent",
};

const paletteButton: React.CSSProperties = {
  position: "relative",
  color: "rgba(255,255,255,0.82)",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const backButton: React.CSSProperties = {
  ...toolButton,
  flex: "0 0 50px",
  width: 50,
  minWidth: 50,
  height: 50,
  borderRadius: 18,
  background: "rgba(255,255,255,0.1)",
};

const activeToolBadge: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 112,
  padding: "0 14px",
  borderRadius: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  color: "#ffffff",
  background: "linear-gradient(135deg, #d9825f, #b85d6a)",
  boxShadow: "0 10px 24px rgba(208,138,106,0.24)",
};

const activeToolText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const compactActionButton: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 96,
  padding: "0 16px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const compactActionButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(217,130,95,0.95), rgba(184,93,106,0.95))",
  boxShadow: "0 10px 24px rgba(208,138,106,0.24)",
};

const colorButton: React.CSSProperties = {
  ...toolButton,
  position: "relative",
  flex: "0 0 58px",
  width: 58,
  minWidth: 58,
};

const colorDot: React.CSSProperties = {
  position: "absolute",
  right: 7,
  bottom: 7,
  width: 15,
  height: 15,
  borderRadius: 999,
  border: "2px solid rgba(255,255,255,0.92)",
  boxShadow: "0 3px 10px rgba(0,0,0,0.24)",
};

const smallColorDot: React.CSSProperties = {
  position: "absolute",
  right: 7,
  bottom: 7,
  width: 14,
  height: 14,
  borderRadius: 999,
  border: "2px solid rgba(255,255,255,0.92)",
  boxShadow: "0 3px 10px rgba(0,0,0,0.24)",
};

const wideActionButton: React.CSSProperties = {
  flex: "0 0 auto",
  height: 50,
  minWidth: 92,
  padding: "0 16px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.1)",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const floatingSizePanel: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 92,
  zIndex: 45,
  padding: "12px 12px 14px",
  borderRadius: 24,
  background: "rgba(27,29,34,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  boxShadow: "0 18px 38px rgba(0,0,0,0.28)",
  pointerEvents: "auto",
};

const floatingSizeTitle: React.CSSProperties = {
  marginBottom: 10,
  paddingLeft: 4,
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const sizePresetGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const sizePresetButton: React.CSSProperties = {
  flex: "0 0 52px",
  width: 52,
  height: 58,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.82)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const sizePresetButtonActive: React.CSSProperties = {
  background: "linear-gradient(135deg, #d9825f, #b85d6a)",
  color: "#ffffff",
  boxShadow: "0 10px 24px rgba(208,138,106,0.24)",
};

const sizePreviewDot: React.CSSProperties = {
  borderRadius: 999,
  background: "currentColor",
};

const sizePresetText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
};
