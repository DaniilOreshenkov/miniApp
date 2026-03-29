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
        {/* spacer */}
        <div
          style={{
            height: `calc(env(safe-area-inset-top) + ${topOffset}px)`,
          }}
        />

        {/* ===== TOP BAR ===== */}
        <div style={topBar}>
          <button style={iconButton} onClick={onBack}>
            ←
          </button>

          <button style={iconButton}>≡</button>

          <button style={saveButton}>Сохранить</button>
        </div>

        {/* ===== HEADER BLOCK (ВОЗВРАЩЕННЫЙ) ===== */}
        <div style={headerBlock}>
          <div style={badge}>10×10 крест.</div>
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
  background: "var(--bg)",
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

  background: "rgba(255,255,255,0.08)", // 🔥 темный стиль как на скрине
  backdropFilter: "blur(20px)",

  borderRadius: 20,
  padding: "10px 12px",
};

const iconButton: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "none",

  background: "rgba(255,255,255,0.1)",
  color: "#fff",

  fontSize: 16,
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
// ===== HEADER BLOCK (КАК НА СКРИНЕ) =====
//

const headerBlock: React.CSSProperties = {
  marginTop: 12,

  background: "rgba(255,255,255,0.06)",
  backdropFilter: "blur(20px)",

  borderRadius: 20,
  padding: 16,
};

const badge: React.CSSProperties = {
  display: "inline-block",

  background: "rgba(255,255,255,0.08)",
  borderRadius: 999,

  padding: "8px 14px",

  color: "#fff",
  fontSize: 14,
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

  background: "var(--card-bg)",
  borderRadius: 24,

  border: "1px solid rgba(0,0,0,0.04)",
};