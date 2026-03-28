import React from "react";

interface Props {
  onBack?: () => void;
}

const GridSafeScreen: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="telegram-page">
      <div className="telegram-page-content">
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>

        <div style={centerBox}>
          ТЕСТ ЭКРАН
        </div>
      </div>
    </div>
  );
};

export default GridSafeScreen;

const centerBox: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
};