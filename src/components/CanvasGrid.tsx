import React, { useState } from "react";

const CanvasGrid: React.FC = () => {
  const crossesX = 10;
  const crossesY = 10;

  const size = 22;
  const gap = 2;

  const cols = crossesX * 2;
  const rows = crossesY * 2;

  const palette = ["#000000", "#ff0000", "#00ff00", "#0000ff"];

  const [colors, setColors] = useState<string[]>(
    Array(cols * rows).fill("transparent")
  );

  const [selectedColor, setSelectedColor] = useState(palette[0]);

  const setColor = (i: number) => {
    const copy = [...colors];
    copy[i] = selectedColor;
    setColors(copy);
  };

  return (
    <div style={wrapper}>
      {/* 🎨 ПАЛИТРА */}
      <div style={paletteWrap}>
        {palette.map((c) => (
          <div
            key={c}
            onClick={() => setSelectedColor(c)}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: c,
              border:
                selectedColor === c
                  ? "3px solid black"
                  : "1px solid #aaa",
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* 🔥 СЕТКА 10x10 */}
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
                    border: "1px solid #d0d0d0",
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
  flexDirection: "column",
};

const paletteWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 10,
  marginBottom: 10,
};

const grid: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};