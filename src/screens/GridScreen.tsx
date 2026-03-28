import React from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  const blockTouch = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  return (
    <div
      className="telegram-page"
      onTouchStart={blockTouch}
      onTouchMove={blockTouch}
    >
      <div className="telegram-page-content">
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>

        <div style={box}>
          GRID TEST
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

const box: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
};