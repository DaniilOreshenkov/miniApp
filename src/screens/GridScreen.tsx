import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div style={wrapperStyle}>
      {/* 🔥 ЛЕВЫЙ БЛОКЕР */}
      <div style={edgeLeft} />

      {/* 🔥 ПРАВЫЙ БЛОКЕР */}
      <div style={edgeRight} />

      <div className="telegram-page" style={contentStyle}>
        <div className="telegram-page-content">
          <button className="back-button" onClick={onBack}>
            ← Назад
          </button>

          <div style={box}>GRID TEST</div>
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

/* ===== WRAPPER ===== */
const wrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

/* ===== CONTENT ===== */
const contentStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
};

/* ===== EDGE BLOCKERS ===== */
const edgeLeft: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 32, // 🔥 зона
  height: "100%",
  zIndex: 9999,
  touchAction: "none",
};

const edgeRight: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  width: 32,
  height: "100%",
  zIndex: 9999,
  touchAction: "none",
};

/* ===== TEST BOX ===== */
const box: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
};