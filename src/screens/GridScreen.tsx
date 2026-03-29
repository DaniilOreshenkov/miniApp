import React, { useEffect, useState } from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  const [topOffset, setTopOffset] = useState(56);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;

    const update = () => {
      if (!tg) return;

      const diff =
        (tg.viewportHeight || 0) - (tg.viewportStableHeight || 0);

      setTopOffset(diff > 0 ? diff : 56);
    };

    update();
    tg?.onEvent?.("viewportChanged", update);

    return () => {
      tg?.offEvent?.("viewportChanged", update);
    };
  }, []);

  return (
    <div style={root}>
      <div className="app-fixed" style={container}>
        {/* 🔥 ВАЖНО: spacer вместо padding */}
        <div style={{ height: `calc(env(safe-area-inset-top) + ${topOffset}px)` }} />

        {/* ===== TOP BAR ===== */}
        <div style={topBar}>
          <button style={iconButton} onClick={onBack}>
            ←
          </button>

          <button style={iconButton}>
            ≡
          </button>

          <button style={saveButton}>
            Сохранить
          </button>
        </div>

        {/* ===== CANVAS ===== */}
        <div style={canvasWrapper}>
          <div style={canvas}>GRID</div>
        </div>
      </div>
    </div>
  );
};

export default GridScreen;

//
// ===== STYLES =====
//

const root: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--bg)", // как Home
};

const container: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",

  padding: 16,
  boxSizing: "border-box",

  overflow: "hidden",
  touchAction: "none",
};

//
// ===== TOP BAR =====
//

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,

  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(20px)", // 🔥 как в Home

  borderRadius: 20,
  padding: "10px 12px",

  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const iconButton: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "none",
  background: "rgba(255,255,255,0.6)",
  backdropFilter: "blur(10px)",

  fontSize: 18,
  cursor: "pointer",
};

const saveButton: React.CSSProperties = {
  marginLeft: "auto",

  height: 40,
  padding: "0 16px",

  borderRadius: 14,
  border: "none",

  background: "#0a84ff",
  color: "#fff",

  fontSize: 14,
  fontWeight: 600,

  cursor: "pointer",
};

//
// ===== CANVAS =====
//

const canvasWrapper: React.CSSProperties = {
  flex: 1,
  marginTop: 16,
};

const canvas: React.CSSProperties = {
  width: "100%",
  height: "100%",

  background: "#fff",
  borderRadius: 28,

  boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
};