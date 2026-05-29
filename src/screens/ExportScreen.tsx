/**
 * ExportScreen — полноэкранный экран экспорта PNG.
 * Заменяет старый bottom-sheet в GridScreen.
 */

import React from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";

interface Props {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  pngPreviewUrl: string | null;
  isGeneratingPreview: boolean;
  onDownload: () => void;
  onClose: () => void;
}

const ExportScreen: React.FC<Props> = ({
  projectName,
  onProjectNameChange,
  pngPreviewUrl,
  isGeneratingPreview,
  onDownload,
  onClose,
}) => {
  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button type="button" style={backBtnStyle} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={topTitleStyle}>Экспорт PNG</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Content */}
      <div style={scrollStyle} className="app-scroll">

        {/* Preview */}
        <div style={previewCardStyle}>
          {isGeneratingPreview ? (
            <div style={previewPlaceholderStyle}>
              <span style={spinnerStyle} />
              <span>Готовим PNG…</span>
            </div>
          ) : pngPreviewUrl ? (
            <img src={pngPreviewUrl} alt="PNG превью" style={previewImageStyle} />
          ) : (
            <div style={previewPlaceholderStyle}>
              <span>Не удалось сгенерировать превью</span>
            </div>
          )}
        </div>

        {/* Project name */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Имя файла</div>
          <input
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="Название проекта"
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        {/* Download button */}
        <button
          type="button"
          style={{
            ...downloadBtnStyle,
            opacity: isGeneratingPreview ? 0.5 : 1,
            cursor: isGeneratingPreview ? "not-allowed" : "pointer",
          }}
          onClick={onDownload}
          disabled={isGeneratingPreview}
        >
          {isGeneratingPreview ? "Подготовка…" : "Скачать PNG"}
        </button>

        <div style={safeBottomStyle} />
      </div>
    </div>
  );
};

export default ExportScreen;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 150,
  background: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  overflowY: "hidden",
  maxWidth: 520,
  marginLeft: "auto",
  marginRight: "auto",
};

const topBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "52px 1fr 52px",
  alignItems: "center",
  gap: 8,
  padding: "var(--app-safe-top, 0px) 12px 0",
  height: "calc(var(--app-safe-top, 0px) + 56px)",
  background: "var(--bg)",
  borderBottom: `1px solid ${ds.color.border}`,
};

const backBtnStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.md,
};

const topTitleStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
  letterSpacing: -0.2,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  padding: "20px 18px 0",
  boxSizing: "border-box",
};

const previewCardStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "clamp(200px, 40vh, 340px)",
  borderRadius: ds.radius.xxl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.04)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};

const previewPlaceholderStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  textAlign: "center",
  padding: 18,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
};

const spinnerStyle: React.CSSProperties = {
  display: "block",
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: `3px solid ${ds.color.borderStrong}`,
  borderTopColor: ds.color.primary,
  animation: "spin 0.8s linear infinite",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
  border: `1px solid ${ds.color.border}`,
};

const downloadBtnStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  boxShadow: ds.shadow.button,
};

const safeBottomStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "max(20px, var(--app-tg-safe-bottom, 0px))",
};
