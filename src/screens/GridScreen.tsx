import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div style={root}>
      <div style={content}>
        <button onClick={onBack} style={button}>
          ← Назад
        </button>
      </div>
    </div>
  );
};

export default GridScreen;

/* ================= STYLES ================= */

const root: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  justifyContent: "center",
  background: "#0c0e12",
};

const content: React.CSSProperties = {
  width: "100%",
  maxWidth: 860, // 🔥 как HomeScreen
  padding: "0 18px", // 🔥 КЛЮЧ (убивает свайп)
  boxSizing: "border-box",

  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const button: React.CSSProperties = {
  padding: "16px 24px",
  fontSize: 18,
  borderRadius: 12,
  border: "none",
  background: "#ffffff",
  color: "#000",
  fontWeight: 600,
  cursor: "pointer",
};