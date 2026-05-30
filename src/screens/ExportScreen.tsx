/**
 * ExportScreen — полноэкранный экран экспорта PNG.
 * Заменяет старый bottom-sheet в GridScreen.
 */

import React, { useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import { getActivePlan } from "../entities/subscription/plans";

const WM_STORAGE_KEY = "beadly-watermark-v1";

const loadWatermarkPrefs = (): { enabled: boolean; text: string } => {
  try {
    const raw = localStorage.getItem(WM_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { enabled: boolean; text: string };
  } catch { /* ignore */ }
  return { enabled: true, text: "@skapova_studio" };
};

const saveWatermarkPrefs = (prefs: { enabled: boolean; text: string }) => {
  try { localStorage.setItem(WM_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
};

interface Props {
  pngPreviewUrl: string | null;
  isGeneratingPreview: boolean;
  onShare: (watermarkEnabled: boolean, watermarkText: string) => void;
  onRegeneratePreview: (watermarkEnabled: boolean, watermarkText: string) => void;
  onOpenPaywall?: (feature?: string) => void;
  onClose: () => void;
}

const ExportScreen: React.FC<Props> = ({
  pngPreviewUrl,
  isGeneratingPreview,
  onShare,
  onRegeneratePreview,
  onOpenPaywall,
  onClose,
}) => {
  const plan = getActivePlan();
  const canCustomWm = plan.canWatermark;

  const [sharing, setSharing] = useState(false);
  // Non-pro plans: watermark always on with @skapova_studio
  const [wmEnabled, setWmEnabled] = useState(() => canCustomWm ? loadWatermarkPrefs().enabled : true);
  const [wmText, setWmText] = useState(() => canCustomWm ? loadWatermarkPrefs().text : "@skapova_studio");

  const handleToggleWm = () => {
    const next = !wmEnabled;
    setWmEnabled(next);
    saveWatermarkPrefs({ enabled: next, text: wmText });
    onRegeneratePreview(next, wmText);
  };

  const handleWmTextChange = (text: string) => {
    setWmText(text);
    saveWatermarkPrefs({ enabled: wmEnabled, text });
    onRegeneratePreview(wmEnabled, text);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      await onShare(wmEnabled, wmText);
    } finally {
      setSharing(false);
    }
  };
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

        {/* Водяной знак */}
        <div style={wmSectionStyle}>
          <div style={wmRowStyle}>
            <div style={wmLabelStyle}>
              Водяной знак
              {!canCustomWm && <span style={wmLockBadgeStyle}> 🔒 Про</span>}
            </div>
            {canCustomWm ? (
              <button
                type="button"
                onClick={handleToggleWm}
                style={{ ...wmToggleStyle, background: wmEnabled ? ds.color.primary : "rgba(120,120,128,0.32)" }}
                aria-label={wmEnabled ? "Выключить водяной знак" : "Включить водяной знак"}
              >
                <span style={{ ...wmThumbStyle, left: wmEnabled ? 24 : 2 }} />
              </button>
            ) : (
              <span style={{ fontSize: 13, color: ds.color.textTertiary }}>Всегда вкл.</span>
            )}
          </div>
          {wmEnabled && (
            <input
              value={wmText}
              onChange={canCustomWm ? (e) => handleWmTextChange(e.target.value) : undefined}
              readOnly={!canCustomWm}
              placeholder="@skapova_studio"
              maxLength={40}
              style={{ ...wmInputStyle, opacity: canCustomWm ? 1 : 0.5 }}
            />
          )}
          {!canCustomWm && (
            <button type="button"
              onClick={() => onOpenPaywall?.("Свой водяной знак и отключение бренда")}
              style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer",
                fontSize: 12, color: ds.color.primary }}>
              Свой текст и отключение — план <strong>Про</strong> →
            </button>
          )}
        </div>

        {/* Share / Save button */}
        <button
          type="button"
          style={{
            ...downloadBtnStyle,
            opacity: isGeneratingPreview || sharing ? 0.5 : 1,
            cursor: isGeneratingPreview || sharing ? "not-allowed" : "pointer",
          }}
          onClick={handleShare}
          disabled={isGeneratingPreview || sharing}
        >
          {sharing ? "Сохраняем…" : isGeneratingPreview ? "Подготовка…" : "Поделиться"}
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


/* Watermark section */
const wmSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "14px 16px",
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const wmRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const wmLabelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const wmLockBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: ds.color.textTertiary,
};

const wmToggleStyle: React.CSSProperties = {
  width: 48,
  height: 28,
  borderRadius: 14,
  border: "none",
  padding: 0,
  cursor: "pointer",
  position: "relative",
  transition: "background 0.2s",
  flexShrink: 0,
};

const wmThumbStyle: React.CSSProperties = {
  position: "absolute",
  top: 3,
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "#ffffff",
  boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
  transition: "left 0.2s",
};

const wmInputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "10px 14px",
  borderRadius: ds.radius.xl,
  fontSize: 15,
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
