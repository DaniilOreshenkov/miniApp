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
import { useKeyboardAwareSheet } from "../utils/useKeyboardAwareSheet";
import type { GridSeed } from "../entities/project/types";
import {
  createImageImportPreview,
  getDefaultImageImportSettings,
  type ImageImportSettings,
} from "../utils/projectPng";

interface Props {
  open: boolean;
  file: File | null;
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

type SheetLayout = {
  maxHeight: number;
  bottomOffset: number;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
};

const sanitizeNumericInput = (value: string) => value.replace(/\D/g, "");

const clampNumber = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const isGridValueValid = (value: string) => {
  if (value.trim() === "") return false;
  const numericValue = Number(value);

  return (
    Number.isInteger(numericValue) &&
    numericValue >= MIN_GRID_SIZE &&
    numericValue <= MAX_GRID_SIZE
  );
};

const clampGridValueOnBlur = (value: string) => {
  if (value.trim() === "") return "";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "";
  if (numericValue < MIN_GRID_SIZE) return String(MIN_GRID_SIZE);
  if (numericValue > MAX_GRID_SIZE) return String(MAX_GRID_SIZE);

  return String(numericValue);
};

const getPreviewKey = (file: File, settings: ImageImportSettings) => {
  return [
    file.name,
    file.size,
    file.lastModified,
    settings.width,
    settings.height,
    settings.detail,
    settings.colorCount,
  ].join(":");
};

const getSliderValueFromClientX = (
  slider: HTMLDivElement | null,
  clientX: number,
  min: number,
  max: number,
) => {
  if (!slider) return null;

  const rect = slider.getBoundingClientRect();
  if (rect.width <= 0) return null;

  const percent = clampNumber((clientX - rect.left) / rect.width, 0, 1);
  return Math.round(min + percent * (max - min));
};

const ImportImageSheet: React.FC<Props> = ({ open, file, onClose, onCreate }) => {
  const [gridWidth, setGridWidth] = useState("30");
  const [gridHeight, setGridHeight] = useState("30");
  const [detail, setDetail] = useState(70);
  const [colorCount, setColorCount] = useState(24);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<GridSeed | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreviewPaused, setIsPreviewPaused] = useState(false);

  const requestIdRef = useRef(0);
  const lastPreviewKeyRef = useRef("");
  const detailSliderRef = useRef<HTMLDivElement | null>(null);
  const colorCountSliderRef = useRef<HTMLDivElement | null>(null);
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const detailRafRef = useRef<number | null>(null);
  const colorCountRafRef = useRef<number | null>(null);
  const pendingDetailClientXRef = useRef<number | null>(null);
  const pendingColorCountClientXRef = useRef<number | null>(null);
  const isDetailDraggingRef = useRef(false);
  const isColorCountDraggingRef = useRef(false);

  const sheetLayout = useKeyboardAwareSheet(open, sheetContentRef) as SheetLayout;

  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);

  const previewSettings = useMemo<ImageImportSettings | null>(() => {
    if (!isWidthValid || !isHeightValid) return null;

    return {
      width: Number(gridWidth),
      height: Number(gridHeight),
      detail,
      colorCount,
    };
  }, [colorCount, detail, gridHeight, gridWidth, isHeightValid, isWidthValid]);

  const canCreate = Boolean(file && previewSeed && previewSettings && !isPreparing);
  const detailPercent = ((detail - MIN_DETAIL) / (MAX_DETAIL - MIN_DETAIL)) * 100;
  const colorCountPercent =
    ((colorCount - MIN_COLOR_COUNT) / (MAX_COLOR_COUNT - MIN_COLOR_COUNT)) * 100;

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

  const previewContent = useMemo(() => {
    if (previewUrl) {
      return (
        <img src={previewUrl} alt="Предпросмотр сетки" style={previewImageStyle} />
      );
    }

    return (
      <div style={previewPlaceholderStyle}>
        {isPreparing ? "Готовим изображение..." : "Меняй размер, детализацию и цвета"}
      </div>
    );
  }, [isPreparing, previewUrl]);

  const sheetRootStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      left: 0,
      right: 0,
      zIndex: 130,
      bottom: 0,
      transform: open
        ? `translate3d(0, -${sheetLayout.bottomOffset}px, 0)`
        : "translate3d(0, calc(100% + 24px), 0)",
      transition:
        open && sheetLayout.isViewportChanging
          ? "none"
          : "transform var(--sheet-root-transform-duration, 0.3s) var(--sheet-root-transform-ease, cubic-bezier(0.22, 1, 0.36, 1))",
      padding:
        "0 var(--sheet-mobile-gap, 16px) var(--sheet-bottom-gap, max(16px, env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px)))",
      pointerEvents: open ? "auto" : "none",
      touchAction: "auto",
      willChange: open ? "transform" : undefined,
      backfaceVisibility: "hidden",
      transformStyle: "preserve-3d",
      overflow: "visible",
      contain: "layout style",
    }),
    [open, sheetLayout.bottomOffset, sheetLayout.isViewportChanging],
  );

  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      inset: 0,
      background: open ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0)",
      pointerEvents: open ? "auto" : "none",
      touchAction: "auto",
      transition: "background 0.24s ease",
      zIndex: 120,
    }),
    [open],
  );

  const sheetContainerDynamicStyle = useMemo(
    () => getSheetContainerStyle(sheetLayout, open),
    [open, sheetLayout.isKeyboardOpen, sheetLayout.isViewportChanging, sheetLayout.maxHeight],
  );

  const sheetUnderlayStyle = useMemo(
    () => getSheetKeyboardUnderlayStyle(sheetLayout),
    [sheetLayout.bottomOffset, sheetLayout.isKeyboardOpen, sheetLayout.isViewportChanging],
  );

  const sheetContentDynamicStyle = useMemo(
    () => getSheetContentStyle(sheetLayout.isKeyboardOpen),
    [sheetLayout.isKeyboardOpen],
  );

  const previewCardDynamicStyle = useMemo(
    () => getPreviewCardStyle(sheetLayout.isKeyboardOpen),
    [sheetLayout.isKeyboardOpen],
  );

  const widthInputStyle = useMemo<React.CSSProperties>(
    () => ({
      ...sheetInputStyle,
      border:
        gridWidth === "" || isWidthValid
          ? `1px solid ${ds.color.border}`
          : `1px solid ${ds.color.danger}`,
    }),
    [gridWidth, isWidthValid],
  );

  const heightInputStyle = useMemo<React.CSSProperties>(
    () => ({
      ...sheetInputStyle,
      border:
        gridHeight === "" || isHeightValid
          ? `1px solid ${ds.color.border}`
          : `1px solid ${ds.color.danger}`,
    }),
    [gridHeight, isHeightValid],
  );

  const detailFillStyle = useMemo<React.CSSProperties>(
    () => ({
      ...detailSliderFillStyle,
      width: `${detailPercent}%`,
    }),
    [detailPercent],
  );

  const detailThumbDynamicStyle = useMemo<React.CSSProperties>(
    () => ({
      ...detailSliderThumbStyle,
      left: `${detailPercent}%`,
    }),
    [detailPercent],
  );

  const colorCountFillStyle = useMemo<React.CSSProperties>(
    () => ({
      ...detailSliderFillStyle,
      width: `${colorCountPercent}%`,
    }),
    [colorCountPercent],
  );

  const colorCountThumbDynamicStyle = useMemo<React.CSSProperties>(
    () => ({
      ...detailSliderThumbStyle,
      left: `${colorCountPercent}%`,
    }),
    [colorCountPercent],
  );

  const createButtonDynamicStyle = useMemo<React.CSSProperties>(
    () => ({
      ...sheetCreateButtonStyle,
      opacity: canCreate && !isCreating ? 1 : 0.5,
      cursor: canCreate && !isCreating ? "pointer" : "not-allowed",
    }),
    [canCreate, isCreating],
  );

  useEffect(() => {
    return () => {
      if (detailRafRef.current !== null) {
        window.cancelAnimationFrame(detailRafRef.current);
      }

      if (colorCountRafRef.current !== null) {
        window.cancelAnimationFrame(colorCountRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open || !file) return;

    let cancelled = false;
    requestIdRef.current += 1;
    lastPreviewKeyRef.current = "";
    setPreviewUrl(null);
    setPreviewSeed(null);
    setIsPreviewPaused(false);

    const prepareDefaults = async () => {
      try {
        setIsPreparing(true);
        const defaults = await getDefaultImageImportSettings(file);

        if (cancelled) return;

        setGridWidth(String(defaults.width));
        setGridHeight(String(defaults.height));
        setDetail(defaults.detail);
        setColorCount(defaults.colorCount);
      } catch {
        if (!cancelled) {
          window.alert("Не удалось подготовить изображение");
          onClose();
        }
      } finally {
        if (!cancelled) {
          setIsPreparing(false);
        }
      }
    };

    prepareDefaults();

    return () => {
      cancelled = true;
    };
  }, [file, onClose, open]);

  useEffect(() => {
    if (!open || !file) {
      setPreviewUrl(null);
      setPreviewSeed(null);
      return;
    }

    if (isPreparing || !previewSettings) {
      if (!isPreparing) {
        setPreviewUrl(null);
        setPreviewSeed(null);
      }

      return;
    }

    // Во время перетаскивания слайдера не запускаем тяжёлую обработку картинки.
    // UI двигается сразу, а превью пересчитывается один раз после отпускания пальца.
    if (isPreviewPaused) return;

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

    return () => {
      window.clearTimeout(timerId);
    };
  }, [file, isPreparing, isPreviewPaused, open, previewSettings]);

  const handleClose = useCallback(() => {
    if (isCreating) return;

    const activeElement = document.activeElement;
    const shouldBlurKeyboard =
      activeElement instanceof HTMLElement &&
      sheetContentRef.current?.contains(activeElement);

    // Сначала отдаём браузеру один кадр на blur поля, потом закрываем sheet.
    // Так нативная анимация клавиатуры не спорит с анимацией панели.
    if (shouldBlurKeyboard) {
      activeElement.blur();
      window.requestAnimationFrame(onClose);
      return;
    }

    onClose();
  }, [isCreating, onClose]);

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
      window.alert("Не удалось создать сетку из изображения");
    } finally {
      setIsCreating(false);
    }
  }, [canCreate, file, onCreate, previewSeed, previewSettings]);

  const applyDetailFromClientX = useCallback((clientX: number) => {
    const nextDetail = getSliderValueFromClientX(
      detailSliderRef.current,
      clientX,
      MIN_DETAIL,
      MAX_DETAIL,
    );

    if (nextDetail === null) return;

    setDetail((prev) => {
      const normalizedDetail = clampNumber(nextDetail, MIN_DETAIL, MAX_DETAIL);
      return prev === normalizedDetail ? prev : normalizedDetail;
    });
  }, []);

  const updateDetailFromClientX = useCallback(
    (clientX: number, immediate = false) => {
      pendingDetailClientXRef.current = clientX;

      if (immediate) {
        if (detailRafRef.current !== null) {
          window.cancelAnimationFrame(detailRafRef.current);
          detailRafRef.current = null;
        }

        applyDetailFromClientX(clientX);
        return;
      }

      if (detailRafRef.current !== null) return;

      detailRafRef.current = window.requestAnimationFrame(() => {
        detailRafRef.current = null;
        const nextClientX = pendingDetailClientXRef.current;
        if (nextClientX !== null) {
          applyDetailFromClientX(nextClientX);
        }
      });
    },
    [applyDetailFromClientX],
  );

  const handleDetailPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      isDetailDraggingRef.current = true;
      requestIdRef.current += 1;
      setIsPreviewPaused(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateDetailFromClientX(event.clientX, true);
    },
    [updateDetailFromClientX],
  );

  const handleDetailPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDetailDraggingRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      updateDetailFromClientX(event.clientX);
    },
    [updateDetailFromClientX],
  );

  const stopDetailDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (isDetailDraggingRef.current) {
        updateDetailFromClientX(event.clientX, true);
      }

      isDetailDraggingRef.current = false;
      setIsPreviewPaused(isColorCountDraggingRef.current);

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [updateDetailFromClientX],
  );

  const handleDetailKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        setDetail((prev) => clampNumber(prev - 1, MIN_DETAIL, MAX_DETAIL));
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        setDetail((prev) => clampNumber(prev + 1, MIN_DETAIL, MAX_DETAIL));
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setDetail(MIN_DETAIL);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setDetail(MAX_DETAIL);
      }
    },
    [],
  );

  const applyColorCountFromClientX = useCallback((clientX: number) => {
    const nextColorCount = getSliderValueFromClientX(
      colorCountSliderRef.current,
      clientX,
      MIN_COLOR_COUNT,
      MAX_COLOR_COUNT,
    );

    if (nextColorCount === null) return;

    setColorCount((prev) => {
      const normalizedColorCount = clampNumber(
        nextColorCount,
        MIN_COLOR_COUNT,
        MAX_COLOR_COUNT,
      );

      return prev === normalizedColorCount ? prev : normalizedColorCount;
    });
  }, []);

  const updateColorCountFromClientX = useCallback(
    (clientX: number, immediate = false) => {
      pendingColorCountClientXRef.current = clientX;

      if (immediate) {
        if (colorCountRafRef.current !== null) {
          window.cancelAnimationFrame(colorCountRafRef.current);
          colorCountRafRef.current = null;
        }

        applyColorCountFromClientX(clientX);
        return;
      }

      if (colorCountRafRef.current !== null) return;

      colorCountRafRef.current = window.requestAnimationFrame(() => {
        colorCountRafRef.current = null;
        const nextClientX = pendingColorCountClientXRef.current;
        if (nextClientX !== null) {
          applyColorCountFromClientX(nextClientX);
        }
      });
    },
    [applyColorCountFromClientX],
  );

  const handleColorCountPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      isColorCountDraggingRef.current = true;
      requestIdRef.current += 1;
      setIsPreviewPaused(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateColorCountFromClientX(event.clientX, true);
    },
    [updateColorCountFromClientX],
  );

  const handleColorCountPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isColorCountDraggingRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      updateColorCountFromClientX(event.clientX);
    },
    [updateColorCountFromClientX],
  );

  const stopColorCountDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (isColorCountDraggingRef.current) {
        updateColorCountFromClientX(event.clientX, true);
      }

      isColorCountDraggingRef.current = false;
      setIsPreviewPaused(isDetailDraggingRef.current);

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [updateColorCountFromClientX],
  );

  const handleColorCountKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        setColorCount((prev) =>
          clampNumber(prev - 1, MIN_COLOR_COUNT, MAX_COLOR_COUNT),
        );
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        setColorCount((prev) =>
          clampNumber(prev + 1, MIN_COLOR_COUNT, MAX_COLOR_COUNT),
        );
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setColorCount(MIN_COLOR_COUNT);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setColorCount(MAX_COLOR_COUNT);
      }
    },
    [],
  );

  return (
    <>
      <div onClick={handleClose} style={overlayStyle} />

      <div style={sheetRootStyle}>
        <div aria-hidden="true" style={sheetUnderlayStyle} />

        <div style={sheetContainerDynamicStyle}>
          <div style={sheetHandleWrapStyle}>
            <div style={sheetHandleStyle} />
          </div>

          <div style={sheetHeaderStyle}>
            <button onClick={handleClose} type="button" style={closeIconButtonStyle}>
              ✕
            </button>

            <div style={sheetHeaderTitleStyle}>Импорт изображения</div>

            <div />
          </div>

          <div ref={sheetContentRef} style={sheetContentDynamicStyle}>
            <div style={previewCardDynamicStyle}>{previewContent}</div>

            <div style={sheetFieldsRowStyle}>
              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Ширина</div>
                <input
                  value={gridWidth}
                  onChange={(event) =>
                    setGridWidth(sanitizeNumericInput(event.target.value))
                  }
                  onBlur={() => setGridWidth((prev) => clampGridValueOnBlur(prev))}
                  inputMode="numeric"
                  placeholder="1"
                  style={widthInputStyle}
                />
                <div style={sheetHintStyle}>от 1 до 100</div>
              </div>

              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Длина</div>
                <input
                  value={gridHeight}
                  onChange={(event) =>
                    setGridHeight(sanitizeNumericInput(event.target.value))
                  }
                  onBlur={() => setGridHeight((prev) => clampGridValueOnBlur(prev))}
                  inputMode="numeric"
                  placeholder="1"
                  style={heightInputStyle}
                />
                <div style={sheetHintStyle}>от 1 до 100</div>
              </div>
            </div>

            <div style={sheetStackStyle}>
              <div style={detailHeaderStyle}>
                <div style={sheetLabelStyle}>Детализация</div>
                <div style={detailValueStyle}>
                  {detail}% • {detailLabel}
                </div>
              </div>

              <div
                ref={detailSliderRef}
                role="slider"
                tabIndex={0}
                aria-label="Детализация"
                aria-valuemin={MIN_DETAIL}
                aria-valuemax={MAX_DETAIL}
                aria-valuenow={detail}
                style={detailSliderStyle}
                onPointerDown={handleDetailPointerDown}
                onPointerMove={handleDetailPointerMove}
                onPointerUp={stopDetailDragging}
                onPointerCancel={stopDetailDragging}
                onLostPointerCapture={stopDetailDragging}
                onKeyDown={handleDetailKeyDown}
              >
                <div style={detailSliderTrackStyle}>
                  <div style={detailFillStyle} />
                  <div style={detailThumbDynamicStyle} />
                </div>
              </div>
            </div>

            <div style={sheetStackStyle}>
              <div style={detailHeaderStyle}>
                <div style={sheetLabelStyle}>Количество цветов</div>
                <div style={detailValueStyle}>
                  {colorCount} • {colorCountLabel}
                </div>
              </div>

              <div
                ref={colorCountSliderRef}
                role="slider"
                tabIndex={0}
                aria-label="Количество цветов"
                aria-valuemin={MIN_COLOR_COUNT}
                aria-valuemax={MAX_COLOR_COUNT}
                aria-valuenow={colorCount}
                style={detailSliderStyle}
                onPointerDown={handleColorCountPointerDown}
                onPointerMove={handleColorCountPointerMove}
                onPointerUp={stopColorCountDragging}
                onPointerCancel={stopColorCountDragging}
                onLostPointerCapture={stopColorCountDragging}
                onKeyDown={handleColorCountKeyDown}
              >
                <div style={detailSliderTrackStyle}>
                  <div style={colorCountFillStyle} />
                  <div style={colorCountThumbDynamicStyle} />
                </div>
              </div>
            </div>

            <button
              onClick={handleCreate}
              style={createButtonDynamicStyle}
              type="button"
              disabled={!canCreate || isCreating}
            >
              {isCreating ? "Создаём..." : "Создать сетку"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const getSheetContainerStyle = (
  sheetLayout: Pick<SheetLayout, "maxHeight" | "isKeyboardOpen" | "isViewportChanging">,
  open: boolean,
): React.CSSProperties => ({
  ...sheetContainerStyle,
  maxHeight: `min(var(--sheet-max-height, ${sheetLayout.maxHeight}px), calc(var(--app-height, 100dvh) - var(--app-tg-sheet-top-limit, 8px) - var(--sheet-bottom-gap, 16px)))`,
  willChange: sheetLayout.isKeyboardOpen ? "max-height" : undefined,
  transition:
    open && sheetLayout.isViewportChanging
      ? "none"
      : "max-height var(--sheet-container-maxheight-duration, 0.2s) var(--sheet-container-maxheight-ease, cubic-bezier(0.22, 1, 0.36, 1))",
});

const getSheetKeyboardUnderlayStyle = (
  sheetLayout: Pick<SheetLayout, "bottomOffset" | "isViewportChanging">,
): React.CSSProperties => {
  const underlayHeight = Math.max(0, sheetLayout.bottomOffset) + 42;

  return {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -underlayHeight + 8,
    height: underlayHeight,
    background: ds.color.surfaceStrong,
    opacity: sheetLayout.bottomOffset > 0 ? 1 : 0,
    pointerEvents: "none",
    transform: "translate3d(0, 0, 0)",
    transition: sheetLayout.isViewportChanging
      ? "none"
      : "opacity 0.18s ease, height 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
    zIndex: 0,
  };
};

const getSheetContentStyle = (isKeyboardOpen: boolean): React.CSSProperties => ({
  ...sheetContentStyle,
  overflowY: "auto",
  padding: isKeyboardOpen
    ? "0 16px max(28px, env(safe-area-inset-bottom, 0px), var(--app-tg-safe-bottom, 0px), var(--safe-bottom, 0px))"
    : sheetContentStyle.padding,
});

const getPreviewCardStyle = (isKeyboardOpen: boolean): React.CSSProperties => ({
  ...previewCardStyle,
  minHeight: isKeyboardOpen ? 150 : previewCardStyle.minHeight,
  maxHeight: isKeyboardOpen ? 220 : previewCardStyle.maxHeight,
});

const closeIconButtonStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 36,
  height: 36,
  borderRadius: ds.radius.sm,
  fontSize: 18,
  fontWeight: ds.weight.semibold,
  padding: 0,
};

const sheetContainerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  borderRadius: ds.radius.sheet,
  overflow: "hidden",
  boxSizing: "border-box",
  background: ds.color.surfaceStrong,
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  position: "relative",
  zIndex: 1,
};

const sheetHandleWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  paddingTop: 10,
  paddingBottom: 4,
  flexShrink: 0,
};

const sheetHandleStyle: React.CSSProperties = {
  width: 44,
  height: 5,
  borderRadius: ds.radius.pill,
  background: "rgba(255,255,255,0.18)",
};

const sheetHeaderStyle: React.CSSProperties = {
  padding: "0 16px 12px",
  display: "grid",
  gridTemplateColumns: "40px 1fr 40px",
  alignItems: "center",
  flexShrink: 0,
};

const sheetHeaderTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
};

const sheetContentStyle: React.CSSProperties = {
  padding: "0 16px max(18px, env(safe-area-inset-bottom, 0px), var(--app-tg-safe-bottom, 0px), var(--safe-bottom, 0px))",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
  boxSizing: "border-box",
};

const previewCardStyle: React.CSSProperties = {
  minHeight: 220,
  maxHeight: 300,
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
  maxHeight: 300,
  objectFit: "contain",
  display: "block",
};

const previewPlaceholderStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  textAlign: "center",
  padding: 18,
};

const sheetStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sheetFieldsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const sheetLabelStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
};

const sheetHintStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.52)",
  fontSize: ds.font.caption,
  lineHeight: 1.2,
};

const sheetInputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const detailValueStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  whiteSpace: "nowrap",
};

const detailSliderStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const detailSliderTrackStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 10,
  borderRadius: ds.radius.pill,
  background: "rgba(255,255,255,0.14)",
};

const detailSliderFillStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  borderRadius: ds.radius.pill,
  background: "#AF52DE",
};

const detailSliderThumbStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 28,
  height: 28,
  borderRadius: ds.radius.pill,
  background: "#ffffff",
  border: "3px solid #AF52DE",
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  transform: "translate(-50%, -50%)",
};

const sheetCreateButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  marginTop: 4,
  boxShadow: ds.shadow.button,
};

export default memo(ImportImageSheet);
