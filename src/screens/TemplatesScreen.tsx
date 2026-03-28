import React from "react";
import { ui } from "../design-system/ui";
import { ds } from "../design-system/tokens";

const TemplatesScreen: React.FC = () => {
  return (
    <div style={rootStyle}>
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

/* ===== ROOT (ФИКС ПУСТОГО СКРОЛЛА) ===== */
const rootStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "120%", // 🔥 ключевой фикс

  display: "flex",
  flexDirection: "column",

  overflowY: "auto",
  overflowX: "hidden",

  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",

  paddingBottom: 120, // 🔥 чтобы всегда был scroll
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
  flex: 1, // 🔥 растягивает экран вниз
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