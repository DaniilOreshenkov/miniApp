import React, { useEffect, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  const [topOffset, setTopOffset] = useState(72);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;

    const update = () => {
      if (!tg) return;

      const diff =
        (tg.viewportHeight || 0) - (tg.viewportStableHeight || 0);

      const base = diff > 0 ? diff : 56;
      setTopOffset(base + 12);
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
// ===== TOP BAR (СТИЛЬ ИЗ SHEET) =====
//

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,

  marginTop: 4,

  background: "#1b1d22", // 🔥 как sheet
  borderRadius: ds.radius.xl,
  padding: "10px 12px",

  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
};

const iconButton: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.sm,
  fontSize: 16,
};

const saveButton: React.CSSProperties = {
  ...ui.primaryButton,

  marginLeft: "auto",
  height: 40,
  padding: "0 16px",

  borderRadius: ds.radius.lg,
  fontSize: ds.font.buttonMd,
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