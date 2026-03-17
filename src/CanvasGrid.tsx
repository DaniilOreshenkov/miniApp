import React, { useState } from "react";

interface CanvasGridProps {
  crossesX: number;
  crossesY: number;
  palette: string[];
}

const CanvasGrid: React.FC<CanvasGridProps> = ({ crossesX, crossesY, palette }) => {
  const beadSize = 20; // размер бусины
  const spacing = 2; // расстояние между бусинами
  const totalBeadsX = crossesX * 2;
  const totalBeadsY = crossesY * 2;

  const [colors, setColors] = useState<string[]>(
    Array(totalBeadsX * totalBeadsY).fill("transparent")
  );
  const [selectedColor, setSelectedColor] = useState<string>(palette[1]);

  const handleBeadClick = (index: number) => {
    const newColors = [...colors];
    newColors[index] = selectedColor;
    setColors(newColors);
  };

  const beads = [];
  for (let y = 0; y < totalBeadsY; y++) {
    for (let x = 0; x < totalBeadsX; x++) {
      const index = y * totalBeadsX + x;

      // смещаем нечётные ряды на половину бусины
      const offset = y % 2 === 1 ? beadSize / 2 : 0;

      beads.push(
        <div
          key={`${x}-${y}`}
          onClick={() => handleBeadClick(index)}
          style={{
            width: beadSize,
            height: beadSize,
            borderRadius: "50%",
            background: colors[index],
            border: "1px solid #ccc", // видимая граница бусины
            margin: spacing / 2,
            transform: `translateX(${offset}px)`,
            boxSizing: "border-box",
            cursor: "pointer",
          }}
        />
      );
    }
  }

  return (
    <div>
      {/* Палитра */}
      <div style={{ textAlign: "center", marginBottom: "10px" }}>
        {palette.map((color) => (
          <div
            key={color}
            onClick={() => setSelectedColor(color)}
            style={{
              display: "inline-block",
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: color,
              margin: 5,
              border: selectedColor === color ? "3px solid black" : "1px solid #aaa",
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* Сетка крестиков */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflowX: "auto",
          padding: 10,
        }}
      >
        {Array.from({ length: totalBeadsY }).map((_, row) => (
          <div
            key={row}
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            {beads.slice(row * totalBeadsX, (row + 1) * totalBeadsX)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CanvasGrid;