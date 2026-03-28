import React, { useMemo } from "react";
import { ui } from "../design-system/ui";

interface Props {
  onBack?: () => void;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 40;
const CELL_SIZE = 18;
const GAP = 3;

const GridScreen: React.FC<Props> = ({
  onBack,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}) => {
  const grid = useMemo(() => {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => "#ffffff")
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

      {/* SAFE CENTER AREA */}
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
                      background: cell,
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

/* ================= STYLES ================= */

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
  justifyContent: "center",
  overflow: "hidden",
};

const innerContainerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 860,
  padding: "0 18px", // 🔥 safe зона как HomeScreen
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};

const scrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: GAP,
  justifyContent: "center",
  paddingTop: 8,
  paddingBottom: 16,
};

const cellStyle: React.CSSProperties = {
  width: CELL_SIZE,
  height: CELL_SIZE,
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.08)",
};