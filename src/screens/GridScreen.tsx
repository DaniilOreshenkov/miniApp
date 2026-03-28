import React, { useRef } from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  const startRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = {
      x: t.clientX,
      y: t.clientY,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];

    const dx = Math.abs(t.clientX - startRef.current.x);
    const dy = Math.abs(t.clientY - startRef.current.y);

    // ❌ блокируем только горизонтальный свайп
    if (dx > dy) {
      e.preventDefault();
    }
  };

  return (
    <div
      className="telegram-page"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      style={rootStyle}
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

/* ===== ROOT ===== */
const rootStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",

  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
};

/* ===== TEST BOX ===== */
const box: React.CSSProperties = {
  marginTop: 40,
  height: 200,
  borderRadius: 16,
  background: "#fff",
};