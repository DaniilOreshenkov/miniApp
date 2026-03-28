import React, { useMemo } from "react";
import { ui } from "../design-system/ui";

interface Props {
  onBack?: () => void;
  width?: number;
  height?: number;
}

type Cell = {
  color: string;
};

const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 40;
const CELL_SIZE = 18;
const GAP = 3;

const GridScreen: React.FC<Props> = ({
  onBack,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}) => {
  const grid = useMemo<Cell[][]>(() => {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({
        color: "#ffffff",
      }))
    );
  }, [width, height]);

  return (
    <div style={rootStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          ← Назад
        </button>
      </div>

      {/* SAFE CENTERED AREA */}
      <div style={contentAreaStyle}>
        <div style={innerContainerStyle}>
          <div style={scrollAreaStyle}>
            <div
              style={{
                ...gridStyle,
                gridTemplateColumns: `repeat(${width}, ${CELL_SIZE}px)`,
              }}
            >
              {grid.map((row, y) =>
                row.map((cell, x) => (
                  <div
                    key={`${x}-${y}`}
                    style={{
                      ...cellStyle,
                      background: cell.color,
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

//
// STYLES
//

const rootStyle: React.CSSProperties = {
  ...ui.page,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "16px 18px",
};

const backButtonStyle: React.CSSProperties = {
  ...ui.secondaryButton,
};

const contentAreaStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  justifyContent: "center", // 🔥 центр
  overflow: "hidden",
};

const innerContainerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 860, // 🔥 как HomeScreen
  padding: "0 18px", // 🔥 safe