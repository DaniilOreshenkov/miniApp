import React from "react";

type Tool = "move" | "brush" | "erase";

interface Props {
  active: Tool;
  activeColor: string;
  onChange: (tool: Tool) => void;
  onOpenPalette: () => void;
}

const BottomToolbar: React.FC<Props> = ({
  active,
  activeColor,
  onChange,
  onOpenPalette,
}) => {
  return (
    <div style={wrapper}>
      <div style={toolsGroup}>
        <ToolButton
          label="Кисть"
          icon="✏️"
          active={active === "brush"}
          onClick={() => onChange("brush")}
        />

        <ToolButton
          label="Ластик"
          icon="🧽"
          active={active === "erase"}
          onClick={() => onChange("erase")}
        />

        <ToolButton
          label="Двигать"
          icon="✋"
          active={active === "move"}
          onClick={() => onChange("move")}
        />
      </div>

      <button type="button" style={colorButton} onClick={onOpenPalette}>
        <span
          style={{
            ...colorSwatch,
            background: activeColor,
            border:
              activeColor === "#ffffff"
                ? "1px solid rgba(0,0,0,0.14)"
                : "1px solid rgba(255,255,255,0.14)",
          }}
        />
        <span style={colorLabel}>Цвет</span>
      </button>
    </div>
  );
};

export default BottomToolbar;

const ToolButton = ({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      ...toolButton,
      background: active ? "rgba(208,138,106,0.96)" : "rgba(255,255,255,0.06)",
      color: active ? "#ffffff" : "rgba(255,255,255,0.92)",
      boxShadow: active ? "0 8px 18px rgba(208,138,106,0.28)" : "none",
    }}
  >
    <span style={toolIcon}>{icon}</span>
    <span style={toolLabel}>{label}</span>
  </button>
);

const wrapper: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 24,
  minHeight: 76,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 10,
  borderRadius: 24,
  background: "rgba(27,29,34,0.82)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(20px)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
};

const toolsGroup: React.CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const toolButton: React.CSSProperties = {
  minWidth: 0,
  minHeight: 56,
  border: "none",
  borderRadius: 18,
  padding: "8px 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
};

const toolIcon: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
};

const toolLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const colorButton: React.CSSProperties = {
  width: 72,
  minWidth: 72,
  minHeight: 56,
  border: "none",
  borderRadius: 18,
  padding: "8px 10px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  cursor: "pointer",
};

const colorSwatch: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  flexShrink: 0,
};

const colorLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
};
