import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div style={root}>
      <div className="app-fixed" style={container}>
        {/* ===== TOP BAR ===== */}
        <div style={topBar}>
          <button style={iconButton} onClick={onBack}>
            ←
          </button>

          <button style={iconButton}>
            ≡
          </button>

          <button style={saveButton}>
            Сохранить
          </button>
        </div>

        {/* ===== CANVAS ===== */}
        <div style={canvasWrapper}>
          <div style={canvas}>
            GRID
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

//
// ===== STYLES =====
//

const root: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--bg)", // ✅ как в Home
};

const container: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 16,
  boxSizing: "border-box",

  overflow: "hidden",
  touchAction: "none", // 🔥 убивает свайпы
};

//
// ===== TOP BAR =====
//

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,

  background: "#fff",
  borderRadius: 20,
  padding: "10px 12px",

  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const iconButton: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "none",
  background: "#f2f2f7",
  fontSize: 18,
  cursor: "pointer",
};

const saveButton: React.CSSProperties = {
  marginLeft: "auto",

  height: 40,
  padding: "0 16px",

  borderRadius: 14,
  border: "none",

  background: "#0a84ff",
  color: "#fff",

  fontSize: 14,
  fontWeight: 600,

  cursor: "pointer",
};

//
// ===== CANVAS =====
//

const canvasWrapper: React.CSSProperties = {
  flex: 1,
  marginTop: 16,
};

const canvas: React.CSSProperties = {
  width: "100%",
  height: "100%",

  background: "#fff",
  borderRadius: 24,

  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
};