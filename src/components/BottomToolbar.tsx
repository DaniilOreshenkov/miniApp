import React from "react";

type Tool = "select" | "move" | "brush" | "erase" | "palette";

interface Props {
  active: Tool;
  onChange: (tool: Tool) => void;
}

const BottomToolbar: React.FC<Props> = ({ active, onChange }) => {
  return (
    <div style={wrapper}>
      <div style={group}>
        <Button label="↖" active={active === "select"} onClick={() => onChange("select")} />
        <Button label="✋" active={active === "move"} onClick={() => onChange("move")} />
      </div>

      <div style={group}>
        <Button label="✏️" active={active === "brush"} onClick={() => onChange("brush")} />
        <Button label="🧽" active={active === "erase"} onClick={() => onChange("erase")} />
        <Button label="🎨" active={active === "palette"} onClick={() => onChange("palette")} />
      </div>
    </div>
  );
};

export default BottomToolbar;

const Button = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    style={{
      ...button,
      background: active ? "#d08a6a" : "transparent",
      color: active ? "#fff" : "#111",
    }}
  >
    {label}
  </button>
);

const wrapper: React.CSSProperties = {
  position: "absolute",
  bottom: 20,
  left: 16,
  right: 16,
  height: 64,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  borderRadius: 20,
  background: "rgba(255,255,255,0.9)",
  backdropFilter: "blur(20px)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const group: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const button: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "none",
  fontSize: 18,
  cursor: "pointer",
};