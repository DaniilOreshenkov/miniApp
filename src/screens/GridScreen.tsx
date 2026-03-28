import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div style={rootStyle}>
      <div className="app-scroll" style={scrollStyle}>
        <div style={contentStyle}>
          <button className="back-button" onClick={onBack} type="button">
            ← Назад
          </button>

          <div style={box}>GRID TEST</div>

          <div style={bottomSpacerStyle} />
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

const rootStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

const scrollStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
};

const contentStyle: React.CSSProperties = {
  minHeight: "calc(100% + 140px)",
  padding: "20px 20px 120px",
  boxSizing: "border-box",
};

const box: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
};

const bottomSpacerStyle: React.CSSProperties = {
  height: 120,
  flexShrink: 0,
};