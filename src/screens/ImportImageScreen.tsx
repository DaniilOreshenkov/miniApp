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
        {/* Превью */}
        <div style={previewCardStyle}>
          {previewUrl ? (
            <img src={previewUrl} alt="Предпросмотр сетки" style={previewImageStyle} />
          ) : isPreparing ? (
            <div style={previewPlaceholderStyle}>
              <span style={spinnerStyle} />
              <span>Анализируем изображение…</span>
            </div>
          ) : (
            <div style={previewPlaceholderStyle}>
              <span style={previewHintIconStyle}>🎨</span>
              <span>Настрой параметры — появится превью</span>
            </div>
          )}
        </div>

        {/* Размер */}
        <div style={fieldRowStyle}>
          <div style={fieldStackStyle}>
            <div style={labelStyle}>Ширина</div>
            <input
              ref={widthInputRef}
              value={gridWidth}
              onChange={(e) => setGridWidth(sanitizeNumericInput(e.target.value))}
              onBlur={() => setGridWidth((p) => clampGridValueOnBlur(p))}
              onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.focus(); } }}
              inputMode="numeric"
              enterKeyHint="next"
              pattern="[0-9]*"
              placeholder="30"
              style={{
                ...inputStyle,
                border: gridWidth === "" || isWidthValid ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
              }}
            />
            <div style={hintStyle}>от 1 до 100</div>
          </div>

          <div style={fieldStackStyle}>
            <div style={labelStyle}>Длина</div>
            <input
              ref={heightInputRef}
              value={gridHeight}
              onChange={(e) => setGridHeight(sanitizeNumericInput(e.target.value))}
              onBlur={() => setGridHeight((p) => clampGridValueOnBlur(p))}
              onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); heightInputRef.current?.blur(); } }}
              inputMode="numeric"
              enterKeyHint="done"
              pattern="[0-9]*"
              placeholder="30"
              style={{
                ...inputStyle,
                border: gridHeight === "" || isHeightValid ? `1px solid ${ds.color.border}` : `1px solid ${ds.color.danger}`,
              }}
            />
            <div style={hintStyle}>от 1 до 100</div>
          </div>
        </div>

        {/* Детализация */}
        <div style={fieldStackStyle}>
          <div style={sliderHeaderStyle}>
            <div style={labelStyle}>Детализация</div>
            <div style={sliderValueStyle}>{detail}% · {detailLabel}</div>
          </div>
          <div
            ref={detailSliderRef}
            role="slider"
            tabIndex={0}
            aria-label="Детализация"
            aria-valuemin={MIN_DETAIL}
            aria-valuemax={MAX_DETAIL}
            aria-valuenow={detail}
            style={sliderWrapStyle}
            onPointerDown={handleDetailPointerDown}
            onPointerMove={handleDetailPointerMove}
            onPointerUp={stopDetailDragging}
            onPointerCancel={stopDetailDragging}
            onLostPointerCapture={stopDetailDragging}
            onKeyDown={handleDetailKeyDown}
          >
            <div style={sliderTrackStyle}>
              <div style={{ ...sliderFillStyle, width: `${detailPercent}%` }} />
              <div style={{ ...sliderThumbStyle, left: `${detailPercent}%` }} />
            </div>
          </div>
        </div>

        {/* Количество цветов */}
        <div style={fieldStackStyle}>
          <div style={sliderHeaderStyle}>
            <div style={labelStyle}>Количество цветов</div>
            <div style={sliderValueStyle}>{colorCount} · {colorCountLabel}</div>
          </div>
          <div
            ref={colorCountSliderRef}
            role="slider"
            tabIndex={0}
            aria-label="Количество цветов"
            aria-valuemin={MIN_COLOR_COUNT}
            aria-valuemax={MAX_COLOR_COUNT}
            aria-valuenow={colorCount}
            style={sliderWrapStyle}
            onPointerDown={handleColorCountPointerDown}
            onPointerMove={handleColorCountPointerMove}
            onPointerUp={stopColorCountDragging}
            onPointerCancel={stopColorCountDragging}
            onLostPointerCapture={stopColorCountDragging}
            onKeyDown={handleColorCountKeyDown}
          >
            <div style={sliderTrackStyle}>
              <div style={{ ...sliderFillStyle, width: `${colorCountPercent}%` }} />
              <div style={{ ...sliderThumbStyle, left: `${colorCountPercent}%` }} />
            </div>
          </div>
        </div>

        {/* Кнопка создания */}
        <button
          type="button"
          style={{
            ...createButtonStyle,
            opacity: canCreate && !isCreating ? 1 : 0.5,
            cursor: canCreate && !isCreating ? "pointer" : "not-allowed",
          }}
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

/* Нормальный скролл — браузер сам обрабатывает клавиатуру */
const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  padding: "16px 18px 0",
  boxSizing: "border-box",
};

const previewCardStyle: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 200,
  maxHeight: 320,
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
  maxHeight: 320,
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

const fieldRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const fieldStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
};

const hintStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: ds.font.caption,
  lineHeight: 1.2,
};

const inputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

const sliderHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const sliderValueStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
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

const sliderTrackStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 10,
  borderRadius: ds.radius.pill,
  background: "rgba(255,255,255,0.14)",
};

const sliderFillStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  borderRadius: ds.radius.pill,
  background: ds.color.primary,
};

const sliderThumbStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 28,
  height: 28,
  borderRadius: ds.radius.pill,
  background: "#ffffff",
  border: `3px solid ${ds.color.primary}`,
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  transform: "translate(-50%, -50%)",
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
  height: "max(20px, env(safe-area-inset-bottom, 12px))",
};
