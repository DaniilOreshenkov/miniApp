import React, { useMemo } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import TabBar from "../components/TabBar";

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

const GridScreen: React.FC<Props> = ({
  onBack,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}) => {
  // создаем сетку (статичную)
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

      {/* GRID */}
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

      {/* TABBAR */}
      <TabBar />
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
  height: "var(--tg-viewport-stable-height, 100vh)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "16px",
};

const backButtonStyle: React.CSSProperties = {
  ...ui.secondaryButton,
};

const gridWrapperStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto", // только скролл, НЕ свайп
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: 16,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: GAP,
};

const cellStyle: React.CSSProperties = {
  width: CELL_SIZE,
  height: CELL_SIZE,
  borderRadius: 6,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.06)",
};