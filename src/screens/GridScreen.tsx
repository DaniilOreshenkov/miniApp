import React, { useMemo } from "react";

interface Props {
  onBack?: () => void;
  width?: number;
  height?: number;
  wallHeight?: number;
  beadSize?: string;
}

type Cell = {
  color: string;
};

const baseColor = "#ffffff";

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const getRowLength = (rowIndex: number, crossesWidth: number) => {
  return rowIndex % 2 === 0 ? crossesWidth : crossesWidth + 1;
};

const createGrid = (width: number, height: number): Cell[][] => {
  return Array.from({ length: height * 2 + 1 }, (_, rowIndex) =>
    Array.from({ length: getRowLength(rowIndex, width) }, () => ({
      color: baseColor,
    }))
  );
};

const GridScreen: React.FC<Props> = ({
  onBack,
  width = 10,
  height = 10,
  wallHeight,
  beadSize,
}) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const grid = useMemo(() => createGrid(safeWidth, safeHeight), [safeWidth, safeHeight]);

  const boardWidth = safeWidth * xStep + bead;
  const boardHeight = safeHeight * 2 * yStep + bead;

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <div style={headerWrapStyle}>
          <div style={headerStyle}>
            <div style={headerLeftStyle}>
              {onBack ? (
                <button onClick={onBack} style={headerButtonStyle}>
                  Назад
                </button>
              ) : null}
            </div>

            <div style={headerCenterStyle}>Сетка</div>

            <div style={headerRightStyle}>
              <div style={headerChipStyle}>
                {safeWidth}×{safeHeight}
              </div>
            </div>
          </div>
        </div>

        <div style={boardCardStyle}>
          <div style={metaRowStyle}>
            <div style={metaChipStyle}>Стенка: {wallHeight ?? 3}</div>
            <div style={metaChipStyle}>Бусина: {beadSize ?? "2 мм"}</div>
          </div>

          <div style={viewportStyle}>
            <div
              style={{
                position: "relative",
                width: boardWidth,
                height: boardHeight,
                flexShrink: 0,
              }}
            >
              {grid.map((row, r) => {
                const rowLength = getRowLength(r, safeWidth);
                const rowStartX = rowLength === safeWidth + 1 ? 0 : xStep / 2;

                return row.map((cell, c) => {
                  const left = rowStartX + c * xStep;
                  const top = r * yStep;
                  const isBase = cell.color === baseColor;

                  return (
                    <div
                      key={`${r}-${c}`}
                      style={{
                        position: "absolute",
                        left,
                        top,
                        width: bead,
                        height: bead,
                        borderRadius: "50%",
                        border: "1px solid rgba(0,0,0,0.22)",
                        background: isBase
                          ? "linear-gradient(180deg, #fafafa 0%, #e9eaec 100%)"
                          : cell.color,
                        boxShadow:
                          "inset 0 1px 2px rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.12)",
                        boxSizing: "border-box",
                      }}
                    />
                  );
                });
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  width: "100%",
  height: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  minHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  maxHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  background: "linear-gradient(180deg, #121318 0%, #0c0e12 100%)",
  overflow: "hidden",
};

const contentStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  padding: "0 18px 18px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  boxSizing: "border-box",
};

const headerWrapStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  paddingTop: "calc(var(--tg-safe-top, 0px) + 8px)",
  marginBottom: 14,
  flexShrink: 0,
};

const headerStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 56,
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 22,
  background: "rgba(28, 30, 36, 0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
  boxSizing: "border-box",
};

const headerLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
};

const headerCenterStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 800,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const headerRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
};

const headerButtonStyle: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const headerChipStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.84)",
  fontSize: 13,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const boardCardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  flex: 1,
  minHeight: 0,
  padding: 14,
  borderRadius: 22,
  background: "rgba(28, 30, 36, 0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  overflow: "hidden",
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  flexShrink: 0,
};

const metaChipStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.8)",
  fontSize: 12,
};

const viewportStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  borderRadius: 18,
  background: "rgba(18, 20, 25, 0.82)",
  border: "1px solid rgba(255,255,255,0.05)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "auto",
  padding: 18,
  WebkitOverflowScrolling: "touch",
};

export default GridScreen;
