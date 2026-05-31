/**
 * Плейсхолдер пока lazy-экран загружается.
 * Показывает центрированный спиннер в цветах текущей темы.
 */
import React from "react";

const ScreenLoader: React.FC = () => (
  <div style={rootStyle}>
    <div style={spinnerStyle} />
  </div>
);

const rootStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg)",
};

const spinnerStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "3px solid var(--border)",
  borderTopColor: "var(--primary)",
  animation: "spin 0.7s linear infinite",
};

export default ScreenLoader;
