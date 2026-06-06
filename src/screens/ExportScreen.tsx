/**
 * ExportScreen — полноэкранный экран экспорта PNG.
 */

import React, { useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import { getActivePlan } from "../entities/subscription/plans";
import type { ExportAspectRatio } from "../components/CanvasGrid";
import DragSlider from "../components/DragSlider";

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
  colorsPreviewUrl: string | null;
  isGeneratingPreview: boolean;
  onShare: (watermarkEnabled: boolean, watermarkText: string, watermarkOpacity: number, aspectRatio: ExportAspectRatio, includeColors: boolean) => string[] | null;
  onRegeneratePreview: (watermarkEnabled: boolean, watermarkText: string, watermarkOpacity: number, aspectRatio: ExportAspectRatio) => void;
  onOpenPaywall?: (feature?: string) => void;
  onClose: () => void;
}

const ASPECT_RATIOS: { label: string; value: ExportAspectRatio; badge?: string }[] = [
  { label: "9:16", value: "9:16", badge: "Story" },
  { label: "Ориг.", value: "original" },
  { label: "4:5", value: "4:5" },
  { label: "5:7", value: "5:7" },
];

const ExportScreen: React.FC<Props> = ({
  pngPreviewUrl,
  colorsPreviewUrl,
  isGeneratingPreview,
  onShare,
  onRegeneratePreview,
  onOpenPaywall,
  onClose,
}) => {
  const plan = getActivePlan();
  const canCustomWm = plan.canWatermark;

  const [wmEnabled, setWmEnabled] = useState(() => canCustomWm ? loadWatermarkPrefs().enabled : true);
  const [wmText, setWmText] = useState(() => canCustomWm ? loadWatermarkPrefs().text : "@skapova_studio");
  const [wmOpacity, setWmOpacity] = useState(1);
  const [aspectRatio, setAspectRatio] = useState<ExportAspectRatio>("9:16");
  const [includeColors, setIncludeColors] = useState(true);
  const [saveImages, setSaveImages] = useState<string[] | null>(null);
  const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleToggleWm = () => {
    const next = !wmEnabled;
    setWmEnabled(next);
    saveWatermarkPrefs({ enabled: next, text: wmText });
    onRegeneratePreview(next, wmText, wmOpacity, aspectRatio);
  };

  const handleWmTextChange = (text: string) => {
    setWmText(text);
    saveWatermarkPrefs({ enabled: wmEnabled, text });
    onRegeneratePreview(wmEnabled, text, wmOpacity, aspectRatio);
  };

  const handleWmOpacityChange = (opacity: number) => {
    setWmOpacity(opacity);
    onRegeneratePreview(wmEnabled, wmText, opacity, aspectRatio);
  };

  const handleAspectRatio = (next: ExportAspectRatio) => {
    setAspectRatio(next);
    onRegeneratePreview(wmEnabled, wmText, wmOpacity, next);
  };

  const handleShare = () => {
    if (plan.maxProjects === 0) {
      onOpenPaywall?.("Сохранение PNG");
      return;
    }
    setSaveImages(null);

    // Синхронно на всех платформах — скачивание/share начинается сразу
    const dataURLs = onShare(wmEnabled, wmText, wmOpacity, aspectRatio, includeColors);
    if (dataURLs) setSaveImages(dataURLs); // iOS 12 fallback
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
        <div style={topTitleStyle}>Экспорт</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Content */}
      <div style={scrollStyle} className="app-scroll">

        {/* PNG Preview */}
        <div style={getPreviewCardStyle(aspectRatio)}>
          {isGeneratingPreview ? (
            <div style={previewPlaceholderStyle}>
              <span style={spinnerStyle} />
            </div>
          ) : pngPreviewUrl ? (
            <img src={pngPreviewUrl} alt="PNG превью" style={previewImageStyle} />
          ) : (
            <div style={previewPlaceholderStyle}>
              <span style={{ fontSize: 13, color: ds.color.textTertiary }}>Нет превью</span>
            </div>
          )}
        </div>

        {/* Settings card */}
        <div style={sectionStyle}>

          {/* Формат */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="1.5" y="3" width="15" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
                </svg>
              </span>
              <span style={labelStyle}>Формат</span>
            </div>
            <div style={segmentedStyle}>
              {ASPECT_RATIOS.map(({ label, value, badge }) => (
                <button
                  key={value}
                  type="button"
                  style={{
                    ...segmentBtnStyle,
                    background: aspectRatio === value ? ds.color.primary : "transparent",
                    color: aspectRatio === value ? "#fff" : ds.color.textSecondary,
                    fontWeight: aspectRatio === value ? 700 : 500,
                    position: "relative",
                  }}
                  onClick={() => handleAspectRatio(value)}
                >
                  {label}
                  {badge && aspectRatio !== value && (
                    <span style={badgePillStyle}>{badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Список цветов */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="5.5" cy="9" r="2.2" fill="currentColor" opacity="0.9"/>
                  <circle cx="9" cy="5.5" r="2.2" fill="currentColor" opacity="0.7"/>
                  <circle cx="12.5" cy="9" r="2.2" fill="currentColor" opacity="0.5"/>
                  <circle cx="9" cy="12.5" r="2.2" fill="currentColor" opacity="0.35"/>
                </svg>
              </span>
              <div>
                <span style={labelStyle}>Список цветов</span>
                <div style={sublabelStyle}>Вторым файлом</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIncludeColors((v) => !v)}
              style={{ ...toggleStyle, background: includeColors ? ds.color.primary : "rgba(120,120,128,0.32)" }}
              aria-label="Добавить список цветов"
            >
              <span style={{ ...thumbStyle, left: includeColors ? 24 : 2 }} />
            </button>
          </div>

          <div style={dividerStyle} />

          {/* Водяной знак */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2L10.8 7H16L11.6 10.2L13.4 15.2L9 12L4.6 15.2L6.4 10.2L2 7H7.2L9 2Z"
                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                </svg>
              </span>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={labelStyle}>Водяной знак</span>
                  {!canCustomWm && (
                    <span style={proBadgeStyle}>ПРО</span>
                  )}
                </div>
                {canCustomWm && wmEnabled && (
                  <div style={sublabelStyle}>{wmText || "@skapova_studio"}</div>
                )}
              </div>
            </div>
            {canCustomWm ? (
              <button
                type="button"
                onClick={handleToggleWm}
                style={{ ...toggleStyle, background: wmEnabled ? ds.color.primary : "rgba(120,120,128,0.32)" }}
                aria-label="Водяной знак"
              >
                <span style={{ ...thumbStyle, left: wmEnabled ? 24 : 2 }} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenPaywall?.("Свой водяной знак и отключение бренда")}
                style={unlockBtnStyle}
              >
                Разблокировать
              </button>
            )}
          </div>

          {/* Поле ввода знака — только Про */}
          {canCustomWm && wmEnabled && (
            <>
              <div style={dividerStyle} />
              <div style={{ padding: "10px 0 4px" }}>
                <input
                  value={wmText}
                  onChange={(e) => handleWmTextChange(e.target.value)}
                  placeholder="@skapova_studio"
                  maxLength={40}
                  style={wmInputStyle}
                />
              </div>
            </>
          )}

        </div>

        {/* iOS fallback */}
        {saveImages && (
          <div style={saveImagesBlockStyle}>
            <div style={saveImagesHintStyle}>
              {isMobile
                ? "Нажми и удержи → «Сохранить изображение»"
                : "Правый клик → «Сохранить изображение»"}
            </div>
            {saveImages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={i === 0 ? "Схема" : "Цвета"}
                style={saveImageStyle}
                draggable={false}
              />
            ))}
          </div>
        )}

        {/* Share / Save button */}
        <button
          type="button"
          onClick={handleShare}
          style={downloadBtnStyle}
        >
          {plan.maxProjects === 0 ? (
            <>
              <LockIcon /> Нужен план
            </>
          ) : (
            <>
              <ShareIcon /> Поделиться
            </>
          )}
        </button>

        <div style={safeBottomStyle} />
      </div>
    </div>
  );
};

/* ─── Icons ──────────────────────────────────────────────────────────────── */

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink:0 }}>
    <path d="M9 2V11M9 2L6 5M9 2L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3.5 9.5V14.5C3.5 15.05 3.95 15.5 4.5 15.5H13.5C14.05 15.5 14.5 15.05 14.5 14.5V9.5"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0 }}>
    <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.7"/>
    <path d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
);

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
  animation: "ui-sheet-in 360ms cubic-bezier(0.32, 0.72, 0, 1) both",
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

const ASPECT_RATIO_CSS: Record<string, string> = {
  "original": "auto",
  "9:16": "9 / 16",
  "4:5": "4 / 5",
  "5:7": "5 / 7",
};

const getPreviewCardStyle = (aspectRatio: string): React.CSSProperties => {
  const ratio = ASPECT_RATIO_CSS[aspectRatio] ?? "auto";
  const isPortrait = ratio !== "auto";
  return {
    flexShrink: 0,
    // Portrait formats: limit by height, let width shrink via aspect-ratio
    // Original: fixed height like before
    ...(isPortrait
      ? {
          alignSelf: "center",
          width: "auto",
          height: "clamp(200px, 46vh, 360px)",
          aspectRatio: ratio,
        }
      : {
          width: "100%",
          height: "clamp(200px, 40vh, 320px)",
        }),
    borderRadius: ds.radius.xxl,
    border: `1px solid ${ds.color.border}`,
    background: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
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
  gap: 0,
  padding: "4px 16px",
  borderRadius: 20,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 0",
};


const labelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const segmentedStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  background: "rgba(120,120,128,0.16)",
  borderRadius: 12,
  padding: 3,
};

const segmentBtnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: 9,
  border: "none",
  fontSize: 13,
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
  WebkitTapHighlightColor: "transparent",
};

const toggleStyle: React.CSSProperties = {
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

const thumbStyle: React.CSSProperties = {
  position: "absolute",
  top: 3,
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "#ffffff",
  boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
  transition: "left 0.2s",
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
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const safeBottomStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "max(20px, var(--app-tg-safe-bottom, 0px))",
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: ds.color.border,
};

const wmOpacityRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const wmOpacityLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: ds.color.textSecondary,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const wmOpacityValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: ds.color.textTertiary,
  alignSelf: "flex-end",
};




const saveImagesBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const saveImagesHintStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: ds.color.textSecondary,
  textAlign: "center",
};

const saveImageStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: ds.radius.lg,
  display: "block",
  WebkitUserSelect: "none",
  userSelect: "none",
};

const colorsPreviewCardStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: ds.radius.xl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.04)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 60,
};

const rowLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const rowIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: ds.color.textSecondary,
  flexShrink: 0,
};

const sublabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: ds.color.textTertiary,
  marginTop: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  maxWidth: 140,
};

const badgePillStyle: React.CSSProperties = {
  position: "absolute",
  top: -7,
  right: -5,
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: 0.3,
  background: "var(--primary)",
  color: "#fff",
  borderRadius: 4,
  padding: "1px 4px",
  lineHeight: 1.5,
  pointerEvents: "none",
};

const proBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 0.5,
  color: "var(--primary)",
  background: "rgba(119,86,223,0.12)",
  border: "1px solid rgba(119,86,223,0.25)",
  borderRadius: 5,
  padding: "1px 5px",
  lineHeight: 1.5,
};

const unlockBtnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(119,86,223,0.35)",
  background: "rgba(119,86,223,0.10)",
  color: "var(--primary)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  boxShadow: "none",
  flexShrink: 0,
};
