import React, { useEffect, useRef } from "react";
import { ui } from "../design-system/ui";
import { ds } from "../design-system/tokens";

const TemplatesScreen: React.FC = () => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
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

      // ❗ если горизонтальный свайп — блокируем
      if (dx > dy) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <div ref={ref} style={rootStyle}>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={ui.screenTitle}>Шаблоны</h1>
        </div>
      </section>

      <section style={templatesSectionStyle}>
        <div style={templatesCardStyle}>
          <div style={emptyIconStyle}>◻︎</div>
          <p style={emptyTextStyle}>
            Пока здесь будет одна ячейка с текстом. Позже сюда добавим шаблоны.
          </p>
        </div>
      </section>
    </div>
  );
};

/* ===== ROOT ===== */
const rootStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",

  WebkitOverflowScrolling: "touch",
};

/* ===== UI ===== */
const secondaryHeroWrapStyle: React.CSSProperties = {
  paddingTop: 22,
  paddingBottom: 10,
};

const secondaryHeroTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingLeft: 2,
};

const templatesSectionStyle: React.CSSProperties = {
  paddingTop: 2,
};

const templatesCardStyle: React.CSSProperties = {
  ...ui.glassCard,
  minHeight: "46vh",
  borderRadius: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: "28px 24px",
  textAlign: "center",
  marginTop: 6,
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 14,
};

const emptyTextStyle: React.CSSProperties = {
  ...ui.bodyText,
  margin: "10px 0 0",
  maxWidth: 320,
  color: ds.color.textTertiary,
};

export default TemplatesScreen;