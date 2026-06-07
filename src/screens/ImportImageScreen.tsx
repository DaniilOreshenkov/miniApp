/**
 * ImportImageScreen — полноэкранный редактор импорта изображения.
 *
 * В отличие от ImportImageSheet (position:fixed, portal), этот экран рендерится
 * в нормальном document flow. Браузер сам скроллит до сфокусированного поля
 * при открытии клавиатуры — никакого useKeyboardAwareSheet не нужно.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import AppAlert from "../components/AppAlert";
import CropEditor from "../components/CropEditor";
import type { AppTheme } from "../app/theme";
import type { GridSeed } from "../entities/project/types";
import {
  analyzeImageForImport,
  computeGridQuality,
  createImageImportPreview,
  getDefaultImageImportSettings,
  type CropRect,
  type ImageImportSettings,
  type SmartImportAnalysis,
} from "../utils/projectPng";

interface Props {
  file: File | null;
  theme?: AppTheme;
  onClose: () => void;
  onCreate: (seed: GridSeed) => void;
}

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const MIN_DETAIL = 1;
const MAX_DETAIL = 100;
const MIN_COLOR_COUNT = 2;
const MAX_COLOR_COUNT = 48;
const PREVIEW_DEBOUNCE_MS = 260;

const sanitizeNumericInput = (value: string) => value.replace(/\D/g, "");

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isGridValueValid = (value: string) => {
  if (value.trim() === "") return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_GRID_SIZE && n <= MAX_GRID_SIZE;
};

const clampGridValueOnBlur = (value: string) => {
  if (value.trim() === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n < MIN_GRID_SIZE) return String(MIN_GRID_SIZE);
  if (n > MAX_GRID_SIZE) return String(MAX_GRID_SIZE);
  return String(n);
};

const getPreviewKey = (file: File, settings: ImageImportSettings) => {
  const c = settings.cropRect;
  const cropKey = c ? `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.w.toFixed(3)},${c.h.toFixed(3)}` : "none";
  return [file.name, file.size, file.lastModified, settings.width, settings.height, settings.detail, settings.colorCount, settings.importStyle ?? "photo", cropKey].join(":");
};

const getSliderValueFromClientX = (
  slider: HTMLDivElement | null,
  clientX: number,
  min: number,
  max: number,
): number | null => {
  if (!slider) return null;
  const rect = slider.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const percent = clampNumber((clientX - rect.left) / rect.width, 0, 1);
  return Math.round(min + percent * (max - min));
};

const ImportImageScreen: React.FC<Props> = ({ file, theme = "dark", onClose, onCreate }) => {
  const [gridWidth, setGridWidth] = useState("30");
  const [gridHeight, setGridHeight] = useState("30");
  const [detail, setDetail] = useState(70);
  const [colorCount, setColorCount] = useState(24);
  const [importStyle, setImportStyle] = useState<"photo" | "pattern">("photo");
  const [cropRect, setCropRect] = useState<CropRect | undefined>(undefined);
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  const [autoAnalysis, setAutoAnalysis] = useState<SmartImportAnalysis | null>(null);
  const [previewQuality, setPreviewQuality] = useState<number | null>(null);
  const analysisDebounceRef = useRef<number | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<GridSeed | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreviewPaused, setIsPreviewPaused] = useState(false);
  const [errorAlert, setErrorAlert] = useState<{ message: string; closeAfterConfirm?: boolean } | null>(null);

  const requestIdRef = useRef(0);
  const lastPreviewKeyRef = useRef("");
  const detailSliderRef = useRef<HTMLDivElement | null>(null);
  const colorCountSliderRef = useRef<HTMLDivElement | null>(null);
  const widthInputRef = useRef<HTMLInputElement | null>(null);
  const heightInputRef = useRef<HTMLInputElement | null>(null);
  const detailRafRef = useRef<number | null>(null);
  const colorCountRafRef = useRef<number | null>(null);
  const pendingDetailClientXRef = useRef<number | null>(null);
  const pendingColorCountClientXRef = useRef<number | null>(null);
  const isDetailDraggingRef = useRef(false);
  const isColorCountDraggingRef = useRef(false);

  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);

  // Pattern mode uses auto-detected color count and max detail
  const effectiveDetail     = importStyle === "pattern" ? 88 : detail;
  const effectiveColorCount = importStyle === "pattern" ? (autoAnalysis?.colorCount ?? colorCount) : colorCount;

  const previewSettings = useMemo<ImageImportSettings | null>(() => {
    if (!isWidthValid || !isHeightValid) return null;
    return { width: Number(gridWidth), height: Number(gridHeight), detail: effectiveDetail, colorCount: effectiveColorCount, importStyle, cropRect };
  }, [effectiveColorCount, effectiveDetail, cropRect, gridHeight, gridWidth, importStyle, isHeightValid, isWidthValid]);

  const canCreate = Boolean(file && previewSeed && previewSettings && !isPreparing);
  const detailPercent = ((detail - MIN_DETAIL) / (MAX_DETAIL - MIN_DETAIL)) * 100;
  const colorCountPercent = ((colorCount - MIN_COLOR_COUNT) / (MAX_COLOR_COUNT - MIN_COLOR_COUNT)) * 100;

  const detailLabel = useMemo(() => {
    if (detail < 35) return "простая";
    if (detail < 75) return "обычная";
    return "детальная";
  }, [detail]);

  const colorCountLabel = useMemo(() => {
    if (colorCount <= 8) return "мало";
    if (colorCount <= 24) return "обычно";
    return "много";
  }, [colorCount]);

  useEffect(() => {
    return () => {
      if (detailRafRef.current !== null) window.cancelAnimationFrame(detailRafRef.current);
      if (colorCountRafRef.current !== null) window.cancelAnimationFrame(colorCountRafRef.current);
    };
  }, []);

  // Оригинальное фото для левой панели
  useEffect(() => {
    if (!file) { setOriginalUrl(null); return; }
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Загружаем дефолтные настройки под конкретное изображение
  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    requestIdRef.current += 1;
    lastPreviewKeyRef.current = "";
    setPreviewUrl(null);
    setPreviewSeed(null);
    setIsPreviewPaused(false);

    const prepare = async () => {
      try {
        setIsPreparing(true);
        const defaults = await getDefaultImageImportSettings(file);
        if (cancelled) return;
        setGridWidth(String(defaults.width));
        setGridHeight(String(defaults.height));
        // Run smart analysis with default grid size
        const analysis = await analyzeImageForImport(file, defaults.width, defaults.height);
        if (cancelled) return;
        setAutoAnalysis(analysis);
        // Apply auto-detected settings immediately
        setDetail(analysis.detail);
        setColorCount(analysis.colorCount);
      } catch {
        if (!cancelled) setErrorAlert({ message: "Не удалось подготовить изображение", closeAfterConfirm: true });
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    };

    prepare();
    return () => { cancelled = true; };
  }, [file]);

  // Генерируем превью с дебаунсом (пауза во время перетаскивания слайдера)
  useEffect(() => {
    if (!file) { setPreviewUrl(null); setPreviewSeed(null); return; }
    if (isPreparing || !previewSettings || isPreviewPaused) return;

    const previewKey = getPreviewKey(file, previewSettings);
    if (lastPreviewKeyRef.current === previewKey) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timerId = window.setTimeout(() => {
      createImageImportPreview(file, previewSettings)
        .then((preview) => {
          if (requestIdRef.current !== requestId) return;
          lastPreviewKeyRef.current = previewKey;
          setPreviewUrl(preview.previewUrl);
          setPreviewSeed(preview.seed);
          setPreviewQuality(computeGridQuality(preview.seed.cells ?? [], preview.seed.width, preview.seed.height));
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setPreviewUrl(null);
          setPreviewSeed(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timerId);
  }, [file, isPreparing, isPreviewPaused, previewSettings]);

  // Re-run smart analysis when grid size changes (debounced 600ms)
  useEffect(() => {
    if (!file || !isWidthValid || !isHeightValid) return;
    if (analysisDebounceRef.current !== null) window.clearTimeout(analysisDebounceRef.current);
    analysisDebounceRef.current = window.setTimeout(async () => {
      try {
        const analysis = await analyzeImageForImport(file, Number(gridWidth), Number(gridHeight));
        setAutoAnalysis(analysis);
      } catch { /* ignore */ }
    }, 600);
    return () => {
      if (analysisDebounceRef.current !== null) window.clearTimeout(analysisDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, gridWidth, gridHeight]);

  const handleErrorAlertDismiss = useCallback(() => {
    const shouldClose = Boolean(errorAlert?.closeAfterConfirm);
    setErrorAlert(null);
    if (shouldClose) onClose();
  }, [errorAlert?.closeAfterConfirm, onClose]);

  const handleCreate = useCallback(async () => {
    if (!canCreate || !file || !previewSettings) return;

    const previewKey = getPreviewKey(file, previewSettings);
    if (previewSeed && lastPreviewKeyRef.current === previewKey) {
      onCreate(previewSeed);
      return;
    }

    try {
      setIsCreating(true);
      const preview = await createImageImportPreview(file, previewSettings);
      lastPreviewKeyRef.current = previewKey;
      setPreviewUrl(preview.previewUrl);
      setPreviewSeed(preview.seed);
      onCreate(preview.seed);
    } catch {
      setErrorAlert({ message: "Не удалось создать сетку из изображения" });
    } finally {
      setIsCreating(false);
    }
  }, [canCreate, file, onCreate, previewSeed, previewSettings]);

  // ── Слайдер «Детализация» ──────────────────────────────────────────────────

  const applyDetailFromClientX = useCallback((clientX: number) => {
    const next = getSliderValueFromClientX(detailSliderRef.current, clientX, MIN_DETAIL, MAX_DETAIL);
    if (next === null) return;
    setDetail((prev) => { const v = clampNumber(next, MIN_DETAIL, MAX_DETAIL); return prev === v ? prev : v; });
  }, []);

  const updateDetailFromClientX = useCallback((clientX: number, immediate = false) => {
    pendingDetailClientXRef.current = clientX;
    if (immediate) {
      if (detailRafRef.current !== null) { window.cancelAnimationFrame(detailRafRef.current); detailRafRef.current = null; }
      applyDetailFromClientX(clientX);
      return;
    }
    if (detailRafRef.current !== null) return;
    detailRafRef.current = window.requestAnimationFrame(() => {
      detailRafRef.current = null;
      if (pendingDetailClientXRef.current !== null) applyDetailFromClientX(pendingDetailClientXRef.current);
    });
  }, [applyDetailFromClientX]);

  const handleDetailPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    isDetailDraggingRef.current = true;
    requestIdRef.current += 1;
    setIsPreviewPaused(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateDetailFromClientX(e.clientX, true);
  }, [updateDetailFromClientX]);

  const handleDetailPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDetailDraggingRef.current) return;
    e.preventDefault(); e.stopPropagation();
    updateDetailFromClientX(e.clientX);
  }, [updateDetailFromClientX]);

  const stopDetailDragging = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (isDetailDraggingRef.current) updateDetailFromClientX(e.clientX, true);
    isDetailDraggingRef.current = false;
    setIsPreviewPaused(isColorCountDraggingRef.current);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, [updateDetailFromClientX]);

  const handleDetailKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setDetail((p) => clampNumber(p - 1, MIN_DETAIL, MAX_DETAIL)); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setDetail((p) => clampNumber(p + 1, MIN_DETAIL, MAX_DETAIL)); return; }
    if (e.key === "Home") { e.preventDefault(); setDetail(MIN_DETAIL); return; }
    if (e.key === "End") { e.preventDefault(); setDetail(MAX_DETAIL); }
  }, []);

  // ── Слайдер «Количество цветов» ───────────────────────────────────────────

  const applyColorCountFromClientX = useCallback((clientX: number) => {
    const next = getSliderValueFromClientX(colorCountSliderRef.current, clientX, MIN_COLOR_COUNT, MAX_COLOR_COUNT);
    if (next === null) return;
    setColorCount((prev) => { const v = clampNumber(next, MIN_COLOR_COUNT, MAX_COLOR_COUNT); return prev === v ? prev : v; });
  }, []);

  const updateColorCountFromClientX = useCallback((clientX: number, immediate = false) => {
    pendingColorCountClientXRef.current = clientX;
    if (immediate) {
      if (colorCountRafRef.current !== null) { window.cancelAnimationFrame(colorCountRafRef.current); colorCountRafRef.current = null; }
      applyColorCountFromClientX(clientX);
      return;
    }
    if (colorCountRafRef.current !== null) return;
    colorCountRafRef.current = window.requestAnimationFrame(() => {
      colorCountRafRef.current = null;
      if (pendingColorCountClientXRef.current !== null) applyColorCountFromClientX(pendingColorCountClientXRef.current);
    });
  }, [applyColorCountFromClientX]);

  const handleColorCountPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    isColorCountDraggingRef.current = true;
    requestIdRef.current += 1;
    setIsPreviewPaused(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateColorCountFromClientX(e.clientX, true);
  }, [updateColorCountFromClientX]);

  const handleColorCountPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isColorCountDraggingRef.current) return;
    e.preventDefault(); e.stopPropagation();
    updateColorCountFromClientX(e.clientX);
  }, [updateColorCountFromClientX]);

  const stopColorCountDragging = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (isColorCountDraggingRef.current) updateColorCountFromClientX(e.clientX, true);
    isColorCountDraggingRef.current = false;
    setIsPreviewPaused(isDetailDraggingRef.current);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, [updateColorCountFromClientX]);

  const handleColorCountKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setColorCount((p) => clampNumber(p - 1, MIN_COLOR_COUNT, MAX_COLOR_COUNT)); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setColorCount((p) => clampNumber(p + 1, MIN_COLOR_COUNT, MAX_COLOR_COUNT)); return; }
    if (e.key === "Home") { e.preventDefault(); setColorCount(MIN_COLOR_COUNT); return; }
    if (e.key === "End") { e.preventDefault(); setColorCount(MAX_COLOR_COUNT); }
  }, []);

  const filename = file
    ? (file.name.length > 36 ? `${file.name.slice(0, 33)}…` : file.name)
    : null;

  return (
    <div style={rootStyle}>
      {/* ── Top bar ── */}
      <div style={topBarStyle}>
        <button type="button" style={backButtonStyle} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div style={topBarCenterStyle}>
          <div style={topBarTitleStyle}>Импорт изображения</div>
          {filename && <div style={topBarFilenameStyle}>{filename}</div>}
        </div>

        <div style={topBarSpacerStyle} />
      </div>

      {/* ── Scrollable content — нормальный document flow, клавиатура работает сама ── */}
      <div style={scrollStyle}>
        {/* Split-превью: оригинал слева, результат справа */}
        <div style={splitCardStyle}>
          {/* Оригинал */}
          <div style={splitPanelStyle}>
            <div style={splitLabelStyle}>
              Оригинал
              {originalUrl && (
                <button
                  type="button"
                  style={cropBadgeStyle}
                  onClick={() => setCropEditorOpen(true)}
                >
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="14" height="14" rx="2.5"
                        stroke="currentColor" strokeWidth="1.7"/>
                      <path d="M2 7h14M7 2v14"
                        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                    </svg>
                    {cropRect ? "Обрезано" : "Обрезать"}
                  </span>
                </button>
              )}
            </div>
            {originalUrl ? (
              <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
                <img src={originalUrl} alt="Оригинал" style={splitImageStyle} />
                {cropRect && (
                  <div style={{
                    position: "absolute",
                    left: `${cropRect.x * 100}%`,
                    top: `${cropRect.y * 100}%`,
                    width: `${cropRect.w * 100}%`,
                    height: `${cropRect.h * 100}%`,
                    border: "2px solid " + ds.color.primary,
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }} />
                )}
              </div>
            ) : (
              <div style={previewPlaceholderStyle}>
                <span style={previewHintIconStyle}>📷</span>
              </div>
            )}
          </div>

          <div style={splitDividerStyle} />

          {/* Результат */}
          <div style={splitPanelStyle}>
            <div style={splitLabelStyle}>Результат</div>
            {previewUrl ? (
              <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
                <img src={previewUrl} alt="Предпросмотр сетки" style={splitImageStyle} />
                {isWidthValid && isHeightValid && (
                  <div style={sizeBadgeStyle}>
                    {gridWidth}×{gridHeight}
                  </div>
                )}
                {previewQuality !== null && (
                  <div style={qualityBadgeStyle(previewQuality)}>
                    {qualityLabel(previewQuality)}
                  </div>
                )}
              </div>
            ) : isPreparing ? (
              <div style={previewPlaceholderStyle}>
                <span style={spinnerStyle} />
              </div>
            ) : (
              <div style={previewPlaceholderStyle}>
                <span style={previewHintIconStyle}>🎨</span>
              </div>
            )}
          </div>
        </div>


        {/* Settings card */}
        <div style={sectionStyle}>

          {/* Режим */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="4" width="6" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="10" y="4" width="6" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
                </svg>
              </span>
              <span style={labelStyle}>Режим</span>
            </div>
            <div style={segmentedStyle}>
              <button type="button"
                style={{ ...segmentBtnStyle, background: importStyle === "photo" ? ds.color.primary : "transparent", color: importStyle === "photo" ? "#fff" : ds.color.textSecondary, fontWeight: importStyle === "photo" ? 700 : 500 }}
                onClick={() => setImportStyle("photo")}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                    <rect x="1.5" y="3" width="15" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
                    <circle cx="5.5" cy="7.5" r="1.5" fill="currentColor" opacity="0.7"/>
                    <path d="M2 13L6 9L9 12L12 9L16 13" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.8"/>
                  </svg>
                  Картинка
                </span>
              </button>
              <button type="button"
                style={{ ...segmentBtnStyle, background: importStyle === "pattern" ? ds.color.primary : "transparent", color: importStyle === "pattern" ? "#fff" : ds.color.textSecondary, fontWeight: importStyle === "pattern" ? 700 : 500 }}
                onClick={() => setImportStyle("pattern")}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                    <circle cx="5" cy="5" r="2" fill="currentColor" opacity="0.9"/>
                    <circle cx="13" cy="5" r="2" fill="currentColor" opacity="0.6"/>
                    <circle cx="5" cy="13" r="2" fill="currentColor" opacity="0.6"/>
                    <circle cx="13" cy="13" r="2" fill="currentColor" opacity="0.9"/>
                    <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.4"/>
                  </svg>
                  Узор
                </span>
              </button>
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Размер */}
          <div style={rowStyle}>
            <div style={rowLeftStyle}>
              <span style={rowIconStyle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                  <line x1="2" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="2" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="7" y1="2" x2="7" y2="16" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="11" y1="2" x2="11" y2="16" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                </svg>
              </span>
              <div>
                <span style={labelStyle}>Размер</span>
                {isWidthValid && isHeightValid && (
                  <div style={sublabelStyle}>{gridWidth}×{gridHeight} бусин</div>
                )}
              </div>
            </div>
            <div style={sizeInputsRowStyle}>
              <input
                ref={widthInputRef}
                value={gridWidth}
                onChange={(e) => setGridWidth(sanitizeNumericInput(e.target.value))}
                onBlur={() => setGridWidth((p) => clampGridValueOnBlur(p))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.focus(); } }}
                inputMode="numeric" enterKeyHint="next" pattern="[0-9]*" placeholder="30"
                style={{ ...sizeInputStyle, border: gridWidth === "" || isWidthValid ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}` }}
              />
              <span style={sizeSepStyle}>×</span>
              <input
                ref={heightInputRef}
                value={gridHeight}
                onChange={(e) => setGridHeight(sanitizeNumericInput(e.target.value))}
                onBlur={() => setGridHeight((p) => clampGridValueOnBlur(p))}
                onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.blur(); } }}
                inputMode="numeric" enterKeyHint="done" pattern="[0-9]*" placeholder="30"
                style={{ ...sizeInputStyle, border: gridHeight === "" || isHeightValid ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}` }}
              />
            </div>
          </div>

          {importStyle === "photo" && (
            <>
              <div style={dividerStyle} />

              {/* Детализация */}
              <div style={rowStyle}>
                <div style={rowLeftStyle}>
                  <span style={rowIconStyle}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="9" cy="9" r="1" fill="currentColor"/>
                    </svg>
                  </span>
                  <div>
                    <span style={labelStyle}>Детализация</span>
                    <div style={sublabelStyle}>{detailLabel}</div>
                  </div>
                </div>
                <span style={sliderValueStyle}>{detail}%</span>
              </div>
              <div style={{ paddingBottom: 10 }}>
                <div
                  ref={detailSliderRef}
                  role="slider" tabIndex={0}
                  aria-label="Детализация" aria-valuemin={MIN_DETAIL} aria-valuemax={MAX_DETAIL} aria-valuenow={detail}
                  style={sliderWrapStyle}
                  onPointerDown={handleDetailPointerDown}
                  onPointerMove={handleDetailPointerMove}
                  onPointerUp={stopDetailDragging}
                  onPointerCancel={stopDetailDragging}
                  onLostPointerCapture={stopDetailDragging}
                  onKeyDown={handleDetailKeyDown}
                >
                  <div style={sliderInnerStyle}>
                    <div style={sliderTrackStyle}>
                      <div style={{ ...sliderFillStyle, width: `${detailPercent}%` }} />
                    </div>
                    <div style={{ ...sliderThumbStyle, left: `${detailPercent}%` }} />
                  </div>
                </div>
              </div>

              <div style={dividerStyle} />

              {/* Количество цветов */}
              <div style={rowStyle}>
                <div style={rowLeftStyle}>
                  <span style={rowIconStyle}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="5.5" cy="9" r="2.5" fill="currentColor" opacity="0.9"/>
                      <circle cx="9" cy="5.5" r="2.5" fill="currentColor" opacity="0.6"/>
                      <circle cx="12.5" cy="9" r="2.5" fill="currentColor" opacity="0.4"/>
                      <circle cx="9" cy="12.5" r="2.5" fill="currentColor" opacity="0.25"/>
                    </svg>
                  </span>
                  <div>
                    <span style={labelStyle}>Цвета</span>
                    <div style={sublabelStyle}>{colorCountLabel}</div>
                  </div>
                </div>
                <span style={sliderValueStyle}>{colorCount}</span>
              </div>
              <div style={{ paddingBottom: 10 }}>
                <div
                  ref={colorCountSliderRef}
                  role="slider" tabIndex={0}
                  aria-label="Количество цветов" aria-valuemin={MIN_COLOR_COUNT} aria-valuemax={MAX_COLOR_COUNT} aria-valuenow={colorCount}
                  style={sliderWrapStyle}
                  onPointerDown={handleColorCountPointerDown}
                  onPointerMove={handleColorCountPointerMove}
                  onPointerUp={stopColorCountDragging}
                  onPointerCancel={stopColorCountDragging}
                  onLostPointerCapture={stopColorCountDragging}
                  onKeyDown={handleColorCountKeyDown}
                >
                  <div style={sliderInnerStyle}>
                    <div style={sliderTrackStyle}>
                      <div style={{ ...sliderFillStyle, width: `${colorCountPercent}%` }} />
                    </div>
                    <div style={{ ...sliderThumbStyle, left: `${colorCountPercent}%` }} />
                  </div>
                </div>
              </div>
            </>
          )}

        </div>


        {/* Кнопка создания */}
        <button
          type="button"
          style={{ ...createButtonStyle, opacity: canCreate && !isCreating ? 1 : 0.5, cursor: canCreate && !isCreating ? "pointer" : "not-allowed" }}
          onClick={handleCreate}
          disabled={!canCreate || isCreating}
        >
          {isCreating ? "Создаём…" : "Создать сетку"}
        </button>

        <div style={safeBottomStyle} />
      </div>

      <AppAlert
        open={Boolean(errorAlert)}
        theme={theme}
        title="Ошибка"
        message={errorAlert?.message}
        confirmText="Понятно"
        onConfirm={handleErrorAlertDismiss}
        onCancel={handleErrorAlertDismiss}
      />

      {cropEditorOpen && originalUrl && (
        <CropEditor
          imageUrl={originalUrl}
          initialCrop={cropRect}
          onConfirm={(rect) => {
            // If user selected almost the whole image, treat as no crop
            const isFullImage = rect.x < 0.01 && rect.y < 0.01 && rect.w > 0.98 && rect.h > 0.98;
            setCropRect(isFullImage ? undefined : rect);
            setCropEditorOpen(false);
          }}
          onCancel={() => setCropEditorOpen(false)}
        />
      )}

    </div>
  );
};

export default memo(ImportImageScreen);

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
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

const backButtonStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.md,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const topBarCenterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  minWidth: 0,
};

const topBarTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  letterSpacing: -0.2,
  textAlign: "center",
};

const topBarFilenameStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.medium,
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
};

const topBarSpacerStyle: React.CSSProperties = {
  width: 40,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "16px 18px 0",
  boxSizing: "border-box",
};

/* Section — точно как в ExportScreen / CreateProjectScreen */
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

const labelStyle: React.CSSProperties = {
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const sublabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: ds.color.textTertiary,
  marginTop: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  maxWidth: 160,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: ds.color.border,
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
  whiteSpace: "nowrap" as const,
};


const splitCardStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "clamp(200px, 38vh, 300px)",
  borderRadius: ds.radius.xxl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.04)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "row",
};

const splitPanelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minWidth: 0,
};

const splitLabelStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  color: ds.color.textTertiary,
  padding: "8px 6px 4px",
  letterSpacing: 0.2,
};

const cropBadgeStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: ds.color.primary,
  fontSize: 10,
  fontWeight: ds.weight.semibold,
  cursor: "pointer",
  padding: "2px 5px",
  borderRadius: ds.radius.md,
};

const splitDividerStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 1,
  background: ds.color.border,
  alignSelf: "stretch",
};

const splitImageStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  objectFit: "contain",
  display: "block",
  minHeight: 0,
};

const previewPlaceholderStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  textAlign: "center",
  padding: 18,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
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

const previewHintIconStyle: React.CSSProperties = {
  fontSize: 28,
  lineHeight: 1,
  opacity: 0.5,
};

const sizeInputsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const sizeInputStyle: React.CSSProperties = {
  ...ui.input,
  width: 58,
  padding: "8px 0",
  borderRadius: ds.radius.lg,
  fontSize: 15,
  fontWeight: 700,
  textAlign: "center",
};

const sizeSepStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: 18,
  fontWeight: ds.weight.semibold,
  flexShrink: 0,
};

const sliderValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: ds.color.textSecondary,
  whiteSpace: "nowrap",
};

const sliderWrapStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const sliderInnerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const sliderTrackStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: 0,
  right: 0,
  height: 5,
  borderRadius: 3,
  background: "rgba(255,255,255,0.15)",
  transform: "translateY(-50%)",
  overflow: "hidden",
};

const sliderFillStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  borderRadius: 3,
  background: ds.color.primary,
};

const sliderThumbStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "#ffffff",
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  transform: "translate(-50%, -50%)",
  overflow: "visible",
};

const createButtonStyle: React.CSSProperties = {
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



/* ── Size badge ─────────────────────────────────────────────────────────── */

const sizeBadgeStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  left: 6,
  padding: "3px 7px",
  borderRadius: ds.radius.pill,
  fontSize: 10,
  fontWeight: ds.weight.semibold,
  letterSpacing: 0.2,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  pointerEvents: "none",
};

/* ── Quality badge ───────────────────────────────────────────────────────── */

const qualityLabel = (q: number): string => {
  if (q >= 0.85) return "✦ отлично";
  if (q >= 0.70) return "◆ хорошо";
  if (q >= 0.55) return "◇ нормально";
  return "· шумно";
};

const qualityBadgeStyle = (q: number): React.CSSProperties => ({
  position: "absolute",
  bottom: 6,
  right: 6,
  padding: "3px 7px",
  borderRadius: ds.radius.pill,
  fontSize: 10,
  fontWeight: ds.weight.semibold,
  letterSpacing: 0.2,
  background: q >= 0.85 ? "rgba(52,199,89,0.85)"
    : q >= 0.70 ? "rgba(255,196,0,0.85)"
    : q >= 0.55 ? "rgba(255,149,0,0.85)"
    : "rgba(255,59,48,0.85)",
  color: "#fff",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  pointerEvents: "none",
});




