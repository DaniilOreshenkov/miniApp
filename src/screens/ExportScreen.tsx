/**
 * ExportScreen — полноэкранный экран экспорта PNG.
 */

import React, { useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import { getActivePlan } from "../entities/subscription/plans";
import type { ExportAspectRatio } from "../components/CanvasGrid";

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

const ASPECT_RATIOS: { label: string; value: ExportAspectRatio }[] = [
  { label: "Ориг.", value: "original" },
  { label: "9:16", value: "9:16" },
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
  const [aspectRatio, setAspectRatio] = useState<ExportAspectRatio>("original");
  const [includeColors, setIncludeColors] = useState(true);
  const [saveImages, setSaveImages] = useState<string[] | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

    if (isMobile) {
      // Мобильный: синхронно — navigator.share требует прямого user gesture
      const dataURLs = onShare(wmEnabled, wmText, wmOpacity, aspectRatio, includeColors);
      if (dataURLs) setSaveImages(dataURLs); // iOS 12 fallback
    } else {
      // ПК: показываем спиннер, затем через rAF делаем тяжёлую работу
      // Download не требует user gesture — rAF безопасен
      setIsExporting(true);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const dataURLs = onShare(wmEnabled, wmText, wmOpacity, aspectRatio, includeColors);
        setIsExporting(false);
        if (dataURLs) setSaveImages(dataURLs);
      }));
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

        {/* Grid preview */}
        <div style={getPreviewCardStyle(aspectRatio)}>
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

        {/* Colors preview — только когда тогл включён */}
        {includeColors && (
          <div style={colorsPreviewCardStyle}>
            {colorsPreviewUrl ? (
              <img src={colorsPreviewUrl} alt="Цвета и подсчёт" style={previewImageStyle} />
            ) : (
              <div style={previewPlaceholderStyle}>
                <span style={spinnerStyle} />
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        <div style={sectionStyle}>

          {/* Aspect ratio */}
          <div style={rowStyle}>
            <span style={labelStyle}>Формат</span>
            <div style={segmentedStyle}>
              {ASPECT_RATIOS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  style={{
                    ...segmentBtnStyle,
                    background: aspectRatio === value ? ds.color.primary : "transparent",
                    color: aspectRatio === value ? "#fff" : ds.color.textSecondary,
                    fontWeight: aspectRatio === value ? 700 : 500,
                  }}
                  onClick={() => handleAspectRatio(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Colors toggle */}
          <div style={rowStyle}>
            <span style={labelStyle}>Цвета и подсчёт</span>
            <button
              type="button"
              onClick={() => setIncludeColors((v) => !v)}
              style={{ ...toggleStyle, background: includeColors ? ds.color.primary : "rgba(120,120,128,0.32)" }}
              aria-label={includeColors ? "Убрать файл цветов" : "Добавить файл цветов"}
            >
              <span style={{ ...thumbStyle, left: includeColors ? 24 : 2 }} />
            </button>
          </div>

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
                style={{ ...toggleStyle, background: wmEnabled ? ds.color.primary : "rgba(120,120,128,0.32)" }}
                aria-label={wmEnabled ? "Выключить водяной знак" : "Включить водяной знак"}
              >
                <span style={{ ...thumbStyle, left: wmEnabled ? 24 : 2 }} />
              </button>
            ) : (
              <span style={{ fontSize: 13, color: ds.color.textTertiary }}>Всегда вкл.</span>
            )}
          </div>
          {wmEnabled && (
            <>
              <input
                value={wmText}
                onChange={canCustomWm ? (e) => handleWmTextChange(e.target.value) : undefined}
                readOnly={!canCustomWm}
                placeholder="@skapova_studio"
                maxLength={40}
                style={{ ...wmInputStyle, opacity: canCustomWm ? 1 : 0.5 }}
              />
              {canCustomWm && (
                <div style={wmOpacityRowStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={wmOpacityLabelStyle}>Прозрачность</span>
                    <span style={wmOpacityValueStyle}>{Math.round(wmOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(wmOpacity * 100)}
                    onChange={(e) => handleWmOpacityChange(Number(e.target.value) / 100)}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLInputElement).setPointerCapture?.(e.pointerId); }}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerUp={(e) => { e.stopPropagation(); (e.currentTarget as HTMLInputElement).releasePointerCapture?.(e.pointerId); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={wmOpacitySliderStyle}
                  />
                </div>
              )}
            </>
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

        {/* Fallback для iOS 12 / браузеров без share — показываем изображения */}
        {saveImages && (
          <div style={saveImagesBlockStyle}>
            <div style={saveImagesHintStyle}>
              Нажми и удержи изображение → «Сохранить»
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

        {/* Save button */}
        <button
          type="button"
          onClick={handleShare}
          disabled={isExporting}
          style={{
            ...downloadBtnStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: isExporting ? 0.7 : 1,
          }}
        >
          {isExporting ? (
            <><span style={exportSpinnerStyle} />Сохраняем…</>
          ) : plan.maxProjects === 0 ? (
            "🔒 Нужен план — Сохранить"
          ) : (
            "Сохранить"
          )}
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

const wmOpacitySliderStyle: React.CSSProperties = {
  width: "100%",
  height: 28,
  accentColor: ds.color.primary,
  cursor: "pointer",
};


const exportSpinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "2.5px solid rgba(255,255,255,0.35)",
  borderTopColor: "#fff",
  animation: "spin 0.7s linear infinite",
  flexShrink: 0,
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
