import React, { useRef } from "react";

type Tool = "move" | "brush" | "erase";

interface Props {
  active: Tool;
  activeColor: string;
  colors: string[];
  onChange: (tool: Tool) => void;
  onOpenPalette: () => void;
  onSelectColor: (color: string) => void;
}

const BottomToolbar: React.FC<Props> = ({
  active,
  activeColor,
  colors,
  onChange,
  onOpenPalette,
  onSelectColor,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
  };

  const handlePaletteClick = () => {
    if (dragRef.current.isDragging) return;
    onOpenPalette();
  };

  const handleColorClick = (color: string) => {
    if (dragRef.current.isDragging) return;

    onSelectColor(color);
    onChange("brush");
  };

  return (
    <div style={wrapper}>
      <div
        ref={scrollRef}
        className="bottom-toolbar-scroll"
        style={scrollArea}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="bottom-toolbar-track" style={toolsGroup}>
          <ToolButton
            label="Кисть"
            active={active === "brush"}
            onClick={() => handleToolClick("brush")}
          >
            <PencilIcon />
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

          <button
            type="button"
            style={{
              ...toolButton,
              ...paletteButton,
            }}
            onClick={handlePaletteClick}
            aria-label="Палитра"
            title="Палитра"
          >
            <PaletteIcon />
          </button>

          <div style={divider} />

          {colors.map((color) => {
            const isActive = color === activeColor;
            const isWhite = color.toLowerCase() === "#ffffff";

            return (
              <button
                key={color}
                type="button"
                onClick={() => handleColorClick(color)}
                aria-label={`Выбрать цвет ${color}`}
                title={color}
                style={{
                  ...colorButton,
                  background: color,
                  border: isActive
                    ? "2px solid rgba(255,255,255,0.96)"
                    : isWhite
                      ? "1px solid rgba(0,0,0,0.22)"
                      : "1px solid rgba(255,255,255,0.14)",
                  boxShadow: isActive
                    ? "0 0 0 4px rgba(217,130,95,0.26)"
                    : "none",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomToolbar;

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

const PencilIcon = () => (
  <svg
    width="29"
    height="29"
    viewBox="0 0 29 29"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M7.1 21.9L8.45 16.35L19.75 5.05C20.72 4.08 22.28 4.08 23.25 5.05L24 5.8C24.97 6.77 24.97 8.33 24 9.3L12.7 20.6L7.1 21.9Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17.9 6.95L22.1 11.15"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M6.4 24.1H22.4"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

const EraserIcon = () => (
  <svg
    width="29"
    height="29"
    viewBox="0 0 29 29"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8.2 18.9L17.8 9.3C18.77 8.33 20.34 8.33 21.31 9.3L22.72 10.71C23.69 11.68 23.69 13.25 22.72 14.22L14.85 22.1H8.2L5.9 19.8C5.4 19.3 5.4 18.5 5.9 18L8.2 15.7"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.1 14L18 18.9"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M14.85 22.1H23.2"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

const MoveIcon = () => (
  <svg
    width="29"
    height="29"
    viewBox="0 0 29 29"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M14.5 4.2V24.8"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M4.2 14.5H24.8"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M14.5 4.2L10.6 8.1"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.5 4.2L18.4 8.1"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.5 24.8L10.6 20.9"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.5 24.8L18.4 20.9"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.2 14.5L8.1 10.6"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.2 14.5L8.1 18.4"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M24.8 14.5L20.9 10.6"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M24.8 14.5L20.9 18.4"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PaletteIcon = () => (
  <svg
    width="29"
    height="29"
    viewBox="0 0 29 29"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M14.5 4.8C9.1 4.8 4.8 8.7 4.8 13.8C4.8 18.9 8.8 23.4 14.5 23.4H16.4C17.5 23.4 18.1 22.1 17.4 21.25C16.95 20.7 17.35 19.85 18.1 19.85H19.45C22.35 19.85 24.2 17.9 24.2 15.1C24.2 9.35 19.9 4.8 14.5 4.8Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.1 13.1H10.12"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M13.3 9.8H13.32"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M17.4 10.4H17.42"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M19.2 14.2H19.22"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

const wrapper: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 14,
  zIndex: 40,
  padding: 6,
  borderRadius: 28,
  background: "rgba(18,18,22,0.72)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.34)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  overflow: "hidden",
};

const scrollArea: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-x",
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
  gap: 8,
  padding: "2px 2px",
  flexWrap: "nowrap",
};

const toolButton: React.CSSProperties = {
  width: 54,
  height: 54,
  minWidth: 54,
  padding: 0,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  outline: "none",
  cursor: "pointer",
  transition:
    "transform 160ms ease, background 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
  WebkitTapHighlightColor: "transparent",
  flex: "0 0 auto",
};

const paletteButton: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.86)",
  boxShadow: "none",
};

const divider: React.CSSProperties = {
  width: 1,
  height: 34,
  minWidth: 1,
  borderRadius: 999,
  background: "rgba(255,255,255,0.12)",
  margin: "0 2px",
  flex: "0 0 auto",
};

const colorButton: React.CSSProperties = {
  width: 42,
  height: 42,
  minWidth: 42,
  padding: 0,
  borderRadius: 999,
  cursor: "pointer",
  outline: "none",
  flex: "0 0 auto",
};