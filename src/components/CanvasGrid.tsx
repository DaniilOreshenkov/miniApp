import React, { useMemo, useState } from "react";

const CanvasGrid: React.FC = () => {
  const crossesX = 5;
  const crossesY = 5;

  const beadSize = 28;
  const horizontalGap = 6;
  const verticalStep = 22;

  const palette = ["#ffffff", "#ff3b30", "#34c759", "#0a84ff", "#ffcc00"];

  const rows = crossesY * 2 + 1;

  const rowLengths = useMemo(
    () =>
      Array.from({ length: rows }, (_, row) =>
        row % 2 === 0 ? crossesX : crossesX + 1
      ),
    [rows, crossesX]
  );

  const totalBeads = rowLengths.reduce((sum, value) => sum + value, 0);

  const [selectedColor, setSelectedColor] = useState<string>(palette[0]);
  const [colors, setColors] = useState<string[]>(
    Array(totalBeads).fill("#f3f3f3")
  );

  const rowStartIndexes = useMemo(() => {
    const starts: number[] = [];
    let current = 0;

    for (const length of rowLengths) {
      starts.push(current);
      current += length;
    }

    return starts;
  }, [rowLengths]);

  const handleBeadClick = (index: number) => {
    setColors((prev) => {
      const next = [...prev];
      next[index] = selectedColor;
      return next;
    });
  };

  return (
    <div style={wrapper}>
      <div style={paletteBar}>
        {palette.map((color) => {
          const active = color === selectedColor;

          return (
            <button
              key={color}
              type="button"
              onClick={() => setSelectedColor(color)}
              style={{
                ...paletteDot,
                background: color,
                border: active
                  ? "3px solid rgba(255,255,255,0.92)"
                  : "1px solid rgba(255,255,255,0.16)",
                boxShadow: active
                  ? "0 0 0 2px rgba(10,132,255,0.35)"
                  : "none",
              }}
            />
          );
        })}
      </div>

      <div style={stage}>
        <div style={gridWrap}>
          {rowLengths.map((length, row) => {
            const startIndex = rowStartIndexes[row];
            const shifted = row % 2 === 0;

            return (
              <div
                key={row}
                style={{
                  ...rowStyle,
                  marginLeft: shifted ? beadSize / 2 + horizontalGap / 2 : 0,
                  marginTop: row === 0 ? 0 : -(beadSize - verticalStep),
                }}
              >
                {Array.from({ length }).map((_, col) => {
                  const index = startIndex + col;

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleBeadClick(index)}
                      style={{
                        ...beadStyle,
                        width: beadSize,
                        height: beadSize,
                        marginLeft: col === 0 ? 0 : horizontalGap,
                        background: colors[index],
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CanvasGrid;

const wrapper: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 18,
  boxSizing: "border-box",
};

const paletteBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 10,
  marginBottom: 18,
  flexShrink: 0,
};

const paletteDot: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  cursor: "pointer",
  padding: 0,
};

const stage: React.CSSProperties = {
  flex: 1,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  overflow: "auto",
};

const gridWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const beadStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "50%",
  cursor: "pointer",
  boxShadow:
    "inset 0 0 0 1px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.18)",
  flexShrink: 0,
  padding: 0,
};