import React, { useEffect, useRef } from "react";

interface Props {
  onBack?: () => void;
}

const GridScreen: React.FC<Props> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];

      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);

      // 🔥 БЛОКИРУЕМ ВСЁ ГОРИЗОНТАЛЬНОЕ
      if (dx > dy) {
        e.preventDefault();
      }
    };

    // 🔥 POINTER EVENTS (ещё жёстче)
    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("pointermove", onPointerMove, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0c0e12",

        // 🔥 КРИТИЧНО
        touchAction: "none",
        overscrollBehavior: "none",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 🔥 EDGE BLOCKERS (МАКСИМУМ) */}
      <div style={edgeLeft} />
      <div style={edgeRight} />

      <button
        onClick={onBack}
        style={{
          padding: "16px 24px",
          fontSize: 18,
          borderRadius: 12,
          border: "none",
          background: "#ffffff",
          color: "#000",
          fontWeight: 600,
        }}
      >
        ← Назад
      </button>
    </div>
  );
};

export default GridScreen;

const edgeLeft: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  bottom: 0,
  width: 48, // 🔥 ЕЩЁ ШИРЕ
  zIndex: 9999,
  background: "transparent",
  touchAction: "none",
};

const edgeRight: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 48,
  zIndex: 9999,
  background: "transparent",
  touchAction: "none",
};