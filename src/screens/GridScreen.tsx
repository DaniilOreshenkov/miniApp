import React, { useEffect, useRef } from "react";

interface Props {
  onBack?: () => void;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 40;
const DEFAULT_HEIGHT = 60;
const CELL_SIZE = 20;

const GridScreen: React.FC<Props> = ({
  onBack,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const canvasWidth = width * CELL_SIZE;
    const canvasHeight = height * CELL_SIZE;

    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;

    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    ctx.scale(dpr, dpr);

    // 🔥 РИСУЕМ СЕТКУ
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, canvasHeight);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(canvasWidth, y * CELL_SIZE);
      ctx.stroke();
    }
  }, [width, height]);

  return (
    <div style={root}>
      {/* HEADER */}
      <div style={header}>
        <button onClick={onBack} style={backButton}>
          ← Назад
        </button>
      </div>

      {/* SAFE CENTER */}
      <div style={center}>
        <div style={container}>
          <div style={scroll}>
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

/* ================= STYLES ================= */

const root: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#0c0e12",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  padding: "16px 18px",
};

const backButton: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "#ffffff",
  color: "#000",
  fontWeight: 600,
  cursor: "pointer",
};

const center: React.CSSProperties = {
  flex: 1,
  display: "flex",
  justifyContent: "center",
  overflow: "hidden",
};

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 860,
  padding: "0 18px", // 🔥 ключ
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};

const scroll: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
};