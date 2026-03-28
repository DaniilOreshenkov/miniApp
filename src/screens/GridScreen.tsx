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

const DEFAULT_WIDTH = 20;
const DEFAULT_HEIGHT = 20;
const CELL_SIZE = 20;
const GAP = 4;

// 🔥 safe зона от свайпа
const SIDE_SAFE = 16;

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

      {/* SAFE CONTENT AREA */}
      <div style={contentSafeArea}>
        <div style={gridWrapperStyle}>
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
  padding: "16px",
};

const backButtonStyle: React.CSSProperties = {
  ...ui.secondaryButton,
};

const contentSafeArea: React.CSSProperties = {
  flex: 1,
  paddingLeft: SIDE_SAFE,
  paddingRight: SIDE_SAFE,
  boxSizing: "border-box",
  overflow: "hidden",
};

const gridWrapperStyle: React.CSSProperties = {
  height: "100%",
  overflow: "auto",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 8,
  paddingBottom: 16,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: GAP,
};

const cellStyle: React.CSSProperties = {
  width: CELL_SIZE,
  height: CELL_SIZE,
  borderRadius: 6,
  border: "1px solid rgba(0,0,0,0.06)",
};