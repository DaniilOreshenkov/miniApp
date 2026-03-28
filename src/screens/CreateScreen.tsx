import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div style={rootStyle}>
      <div className="app-scroll" style={scrollStyle}>
        <div style={contentStyle}>
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

/* ===== ROOT ===== */
const rootStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

/* ===== SCROLL (КАК В HOME) ===== */
const scrollStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",

  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
};

/* ===== CONTENT ===== */
const contentStyle: React.CSSProperties = {
  padding: 20,
  paddingBottom: 120, // 🔥 чтобы всегда был scroll
};

/* ===== TEST ===== */
const box: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
};