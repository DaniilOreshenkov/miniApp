import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div style={rootStyle}>
      <div className="app-fixed" style={fixedStyle}>
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>

        <div style={box}>GRID TEST</div>
      </div>
    </div>
  );
};

export default GridScreen;

/* ===== ROOT ===== */
const rootStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

/* ===== FIXED SCREEN ===== */
const fixedStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden", // ❌ НЕТ СКРОЛЛА

  touchAction: "none", // 🔥 ключевая штука
};

/* ===== TEST ===== */
const box: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
};