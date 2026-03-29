import React, { useState } from "react";

const CanvasGrid: React.FC = () => {
  const crossesX = 5;
  const crossesY = 5;

  const size = 24;
  const gap = 4;

  const cols = crossesX * 2;
  const rows = crossesY * 2;

  const [colors, setColors] = useState<string[]>(
    Array(cols * rows).fill("#e5e5e5")
  );

  const setColor = (i: number) => {
    const copy = [...colors];
    copy[i] = "#000000";
    setColors(copy);
  };

  return (
    <div style={wrapper}>
      <div style={grid}>
        {Array.from({ length: rows }).map((_, y) => (
          <div
            key={y}
            style={{
              display: "flex",
              marginLeft: y % 2 === 1 ? size / 2 : 0,
            }}
          >
            {Array.from({ length: cols }).map((_, x) => {
              const i = y * cols + x;

              return (
                <div
                  key={i}
                  onClick={() => setColor(i)}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: colors[i],
                    margin: gap / 2,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CanvasGrid;

//
// ===== STYLES =====
//

const wrapper: React.CSSProperties = {
  width: "100%",
  height: "100%",

  display: "flex",
  justifyContent: "center",
  alignItems: "center", // 🔥 центр по вертикали

  overflow: "hidden",
};

const grid: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};