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
import AppAlert from "../components/AppAlert";
import {
  screenRoot, screenTopBar, screenBackBtn, screenTitle as screenTitleStyle, screenScroll,
  sectionLabel, sectionCard, screenInput, sizeRow, sizeField, sizeSubLabel, sizeSep,
  sliderHeader, sliderLabel, sliderValue, sliderWrap, sliderTrack, sliderFill, sliderThumb,
  primaryBtn, safeBottom,
} from "./screenStyles";
import type { AppTheme } from "../app/theme";
import type { GridSeed } from "../entities/project/types";
import {
  createImageImportPreview,
  getDefaultImageImportSettings,
  type ImageImportSettings,
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

const getPreviewKey = (file: File, settings: ImageImportSettings) =>
  [file.name, file.size, file.lastModified, settings.width, settings.height, settings.detail, settings.colorCount].join(":");

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

  const previewSettings = useMemo<ImageImportSettings | null>(() => {
    if (!isWidthValid || !isHeightValid) return null;
    return { width: Number(gridWidth), height: Number(gridHeight), detail, colorCount };
  }, [colorCount, detail, gridHeight, gridWidth, isHeightValid, isWidthValid]);

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
        setDetail(defaults.detail);
        setColorCount(defaults.colorCount);
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
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setPreviewUrl(null);
          setPreviewSeed(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timerId);
  }, [file, isPreparing, isPreviewPaused, previewSettings]);

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
    <div style={screenRoot}>
      {/* Top bar */}
      <div style={screenTopBar}>
        <button type="button" style={screenBackBtn} onClick={onClose} aria-label="Назад">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0 }}>
          <div style={screenTitleStyle}>Импорт</div>
          {filename && <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{filename}</div>}
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div style={screenScroll}>
        {/* Split-превью */}
        <div style={splitCardStyle}>
          <div style={splitPanelStyle}>
            <div style={splitLabelStyle}>Оригинал</div>
            {originalUrl
              ? <img src={originalUrl} alt="Оригинал" style={splitImageStyle} />
              : <div style={previewPlaceholderStyle}><span style={previewHintIconStyle}>📷</span></div>
            }
          </div>
          <div style={splitDividerStyle} />
          <div style={splitPanelStyle}>
            <div style={splitLabelStyle}>Результат</div>
            {previewUrl
              ? <img src={previewUrl} alt="Результат" style={splitImageStyle} />
              : isPreparing
                ? <div style={previewPlaceholderStyle}><span style={spinnerStyle} /></div>
                : <div style={previewPlaceholderStyle}><span style={previewHintIconStyle}>🎨</span></div>
            }
          </div>
        </div>

        {/* Размер */}
        <div>
          <div style={sectionLabel}>Размер сетки</div>
          <div style={sectionCard}>
            <div style={sizeRow}>
              <div style={sizeField}>
                <div style={sizeSubLabel}>Ширина</div>
                <input ref={widthInputRef} value={gridWidth}
                  onChange={(e) => setGridWidth(sanitizeNumericInput(e.target.value))}
                  onBlur={() => setGridWidth((p) => clampGridValueOnBlur(p))}
                  onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.focus(); } }}
                  inputMode="numeric" enterKeyHint="next" pattern="[0-9]*" placeholder="30"
                  style={{ ...screenInput, textAlign: "center",
                    border: gridWidth === "" || isWidthValid ? "1px solid var(--border)" : `1px solid ${ds.color.danger}` }} />
              </div>
              <div style={sizeSep}>×</div>
              <div style={sizeField}>
                <div style={sizeSubLabel}>Высота</div>
                <input ref={heightInputRef} value={gridHeight}
                  onChange={(e) => setGridHeight(sanitizeNumericInput(e.target.value))}
                  onBlur={() => setGridHeight((p) => clampGridValueOnBlur(p))}
                  onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.blur(); } }}
                  inputMode="numeric" enterKeyHint="done" pattern="[0-9]*" placeholder="30"
                  style={{ ...screenInput, textAlign: "center",
                    border: gridHeight === "" || isHeightValid ? "1px solid var(--border)" : `1px solid ${ds.color.danger}` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Детализация */}
        <div>
          <div style={sectionLabel}>Детализация</div>
          <div style={sectionCard}>
            <div style={sliderHeader}>
              <div style={sliderLabel}>Детализация</div>
              <div style={sliderValue}>{detail}% · {detailLabel}</div>
            </div>
            <div ref={detailSliderRef} role="slider" tabIndex={0}
              aria-label="Детализация" aria-valuemin={MIN_DETAIL} aria-valuemax={MAX_DETAIL} aria-valuenow={detail}
              style={sliderWrap}
              onPointerDown={handleDetailPointerDown} onPointerMove={handleDetailPointerMove}
              onPointerUp={stopDetailDragging} onPointerCancel={stopDetailDragging}
              onLostPointerCapture={stopDetailDragging} onKeyDown={handleDetailKeyDown}
            >
              <div style={sliderTrack}>
                <div style={{ ...sliderFill, width: `${detailPercent}%` }} />
                <div style={{ ...sliderThumb, left: `${detailPercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Количество цветов */}
        <div>
          <div style={sectionLabel}>Цвета</div>
          <div style={sectionCard}>
            <div style={sliderHeader}>
              <div style={sliderLabel}>Количество цветов</div>
              <div style={sliderValue}>{colorCount} · {colorCountLabel}</div>
            </div>
            <div ref={colorCountSliderRef} role="slider" tabIndex={0}
              aria-label="Количество цветов" aria-valuemin={MIN_COLOR_COUNT} aria-valuemax={MAX_COLOR_COUNT} aria-valuenow={colorCount}
              style={sliderWrap}
              onPointerDown={handleColorCountPointerDown} onPointerMove={handleColorCountPointerMove}
              onPointerUp={stopColorCountDragging} onPointerCancel={stopColorCountDragging}
              onLostPointerCapture={stopColorCountDragging} onKeyDown={handleColorCountKeyDown}
            >
              <div style={sliderTrack}>
                <div style={{ ...sliderFill, width: `${colorCountPercent}%` }} />
                <div style={{ ...sliderThumb, left: `${colorCountPercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Кнопка создания */}
        <button
          type="button"
          style={{
            ...primaryBtn,
            opacity: canCreate && !isCreating ? 1 : 0.5,
            cursor: canCreate && !isCreating ? "pointer" : "not-allowed",
          }}
          onClick={handleCreate}
          disabled={!canCreate || isCreating}
        >
          {isCreating ? "Создаём…" : "Создать сетку"}
        </button>

        <div style={safeBottom} />
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
    </div>
  );
};

export default memo(ImportImageScreen);

