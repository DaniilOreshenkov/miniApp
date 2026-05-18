import React, { useEffect, useMemo, useRef, useState } from "react";
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

type GridPreset = {
  id: string;
  title: string;
  hint: string;
  targetSize: number;
  detail: number;
  colorCount: number;
};

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const MIN_DETAIL = 1;
const MAX_DETAIL = 100;
const MIN_COLOR_COUNT = 2;
const MAX_COLOR_COUNT = 48;
const PREVIEW_DEBOUNCE_MS = 180;

const GRID_PRESETS: GridPreset[] = [
  {
    id: "simple",
    title: "Быстро",
    hint: "меньше бусин",
    targetSize: 28,
    detail: 46,
    colorCount: 10,
  },
  {
    id: "balanced",
    title: "Ровно",
    hint: "для большинства фото",
    targetSize: 40,
    detail: 68,
    colorCount: 20,
  },
  {
    id: "detailed",
    title: "Детально",
    hint: "ближе к фото",
    targetSize: 58,
    detail: 86,
    colorCount: 32,
  },
];

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

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
};

const getPresetGridSize = (
  baseSettings: ImageImportSettings,
  targetLargestSide: number,
) => {
  const baseWidth = clampNumber(baseSettings.width, MIN_GRID_SIZE, MAX_GRID_SIZE);
  const baseHeight = clampNumber(baseSettings.height, MIN_GRID_SIZE, MAX_GRID_SIZE);
  const largestSide = Math.max(baseWidth, baseHeight);

  if (largestSide <= 0) {
    return {
      width: targetLargestSide,
      height: targetLargestSide,
    };
  }

  const scale = targetLargestSide / largestSide;

  return {
    width: clampNumber(Math.round(baseWidth * scale), MIN_GRID_SIZE, MAX_GRID_SIZE),
    height: clampNumber(
      Math.round(baseHeight * scale),
      MIN_GRID_SIZE,
      MAX_GRID_SIZE,
    ),
  };
};

const ImportImageSheet: React.FC<Props> = ({ open, file, onClose, onCreate }) => {
  const [gridWidth, setGridWidth] = useState("30");
  const [gridHeight, setGridHeight] = useState("30");
  const [detail, setDetail] = useState(70);
  const [colorCount, setColorCount] = useState(24);
  const [defaultSettings, setDefaultSettings] = useState<ImageImportSettings | null>(
    null,
  );
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<GridSeed | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const requestIdRef = useRef(0);
  const lastPreviewKeyRef = useRef("");
  const detailSliderRef = useRef<HTMLDivElement | null>(null);
  const colorCountSliderRef = useRef<HTMLDivElement | null>(null);
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const sheetLayout = useKeyboardAwareSheet(open, sheetContentRef);
  const isDetailDraggingRef = useRef(false);
  const isColorCountDraggingRef = useRef(false);

  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const gridCellCount = isWidthValid && isHeightValid
    ? Number(gridWidth) * Number(gridHeight)
    : null;
  const currentPreviewKey = useMemo(() => {
    if (!file || !isWidthValid || !isHeightValid) return "";

    return [
      file.name,
      file.size,
      file.lastModified,
      gridWidth,
      gridHeight,
      detail,
      colorCount,
    ].join(":");
  }, [colorCount, detail, file, gridHeight, gridWidth, isHeightValid, isWidthValid]);
  const isPreviewReady = Boolean(
    previewSeed && currentPreviewKey && lastPreviewKeyRef.current === currentPreviewKey,
  );
  const canCreate = Boolean(
    file &&
      isPreviewReady &&
      !isPreparing &&
      !isPreviewLoading &&
      !isCreating &&
      !previewError,
  );
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

  const complexityLabel = useMemo(() => {
    if (!gridCellCount) return "проверь размер";
    if (gridCellCount < 800) return "простая сборка";
    if (gridCellCount < 2200) return "средняя сборка";
    return "сложная сборка";
  }, [gridCellCount]);

  const previewStatusText = useMemo(() => {
    if (isPreparing) return "Подбираем размер под фото...";
    if (!isWidthValid || !isHeightValid) return "Размер сетки должен быть от 1 до 100";
    if (previewError) return previewError;
    if (isPreviewLoading) return "Обновляем предпросмотр...";
    if (isPreviewReady) return "Предпросмотр готов";
    return "Меняй размер, детализацию и цвета";
  }, [isHeightValid, isPreparing, isPreviewLoading, isPreviewReady, isWidthValid, previewError]);

  const createButtonText = useMemo(() => {
    if (isCreating) return "Создаём...";
    if (isPreparing) return "Готовим изображение...";
    if (isPreviewLoading) return "Готовим предпросмотр...";
    if (previewError) return "Не удалось подготовить";
    return "Создать сетку";
  }, [isCreating, isPreparing, isPreviewLoading, previewError]);

  useEffect(() => {
    if (!open || !file) {
      setOriginalImageUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setOriginalImageUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, open]);

  useEffect(() => {
    if (!open || !file) return;

    let cancelled = false;
    requestIdRef.current += 1;
    lastPreviewKeyRef.current = "";
    setDefaultSettings(null);
    setPreviewUrl(null);
    setPreviewSeed(null);
    setPreviewError(null);
    setIsPreviewLoading(false);

    const prepareDefaults = async () => {
      try {
        setIsPreparing(true);
        const defaults = await getDefaultImageImportSettings(file);

        if (cancelled) return;

        setDefaultSettings(defaults);
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
    if (!open || !file || isPreparing || !currentPreviewKey) {
      if (!isPreparing) {
        setPreviewError(null);
        setIsPreviewLoading(false);
      }

      return;
    }

    if (lastPreviewKeyRef.current === currentPreviewKey && previewSeed) {
      setIsPreviewLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPreviewError(null);
    setIsPreviewLoading(true);

    const timerId = window.setTimeout(() => {
      const settings: ImageImportSettings = {
        width: Number(gridWidth),
        height: Number(gridHeight),
        detail,
        colorCount,
      };

      createImageImportPreview(file, settings)
        .then((preview) => {
          if (requestIdRef.current !== requestId) return;
          lastPreviewKeyRef.current = currentPreviewKey;
          setPreviewUrl(preview.previewUrl);
          setPreviewSeed(preview.seed);
          setPreviewError(null);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setPreviewUrl(null);
          setPreviewSeed(null);
          setPreviewError("Не получилось собрать сетку из этого изображения");
        })
        .finally(() => {
          if (requestIdRef.current !== requestId) return;
          setIsPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    colorCount,
    currentPreviewKey,
    detail,
    file,
    gridHeight,
    gridWidth,
    isPreparing,
    open,
    previewSeed,
  ]);

  const handleClose = () => {
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
  };

  const applyPreset = (preset: GridPreset) => {
    if (!defaultSettings) return;

    const nextSize = getPresetGridSize(defaultSettings, preset.targetSize);
    setGridWidth(String(nextSize.width));
    setGridHeight(String(nextSize.height));
    setDetail(preset.detail);
    setColorCount(preset.colorCount);
  };

  const resetToAutoSettings = () => {
    if (!defaultSettings) return;

    setGridWidth(String(defaultSettings.width));
    setGridHeight(String(defaultSettings.height));
    setDetail(defaultSettings.detail);
    setColorCount(defaultSettings.colorCount);
  };

  const handleCreate = async () => {
    if (!canCreate || !file) return;

    try {
      setIsCreating(true);
      const preview = await createImageImportPreview(file, {
        width: Number(gridWidth),
        height: Number(gridHeight),
        detail,
        colorCount,
      });
      onCreate(preview.seed);
    } catch {
      window.alert("Не удалось создать сетку из изображения");
    } finally {
      setIsCreating(false);
    }
  };

  const updateDetailFromClientX = (clientX: number) => {
    const slider = detailSliderRef.current;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0) return;

    const percent = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const nextDetail = Math.round(
      MIN_DETAIL + percent * (MAX_DETAIL - MIN_DETAIL),
    );

    setDetail((prev) => {
      const normalizedDetail = clampNumber(nextDetail, MIN_DETAIL, MAX_DETAIL);
      return prev === normalizedDetail ? prev : normalizedDetail;
    });
  };

  const handleDetailPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isDetailDraggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateDetailFromClientX(event.clientX);
  };

  const handleDetailPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDetailDraggingRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    updateDetailFromClientX(event.clientX);
  };

  const stopDetailDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isDetailDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleDetailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
  };

  const updateColorCountFromClientX = (clientX: number) => {
    const slider = colorCountSliderRef.current;
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0) return;

    const percent = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const nextColorCount = Math.round(
      MIN_COLOR_COUNT + percent * (MAX_COLOR_COUNT - MIN_COLOR_COUNT),
    );

    setColorCount((prev) => {
      const normalizedColorCount = clampNumber(
        nextColorCount,
        MIN_COLOR_COUNT,
        MAX_COLOR_COUNT,
      );

      return prev === normalizedColorCount ? prev : normalizedColorCount;
    });
  };

  const handleColorCountPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    isColorCountDraggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateColorCountFromClientX(event.clientX);
  };

  const handleColorCountPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isColorCountDraggingRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    updateColorCountFromClientX(event.clientX);
  };

  const stopColorCountDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isColorCountDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleColorCountKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
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
  };

  const previewContent = (
    <div style={previewCompareStyle}>
      <div style={previewPaneStyle}>
        <div style={previewPaneHeaderStyle}>Оригинал</div>
        <div style={previewPaneBodyStyle}>
          {originalImageUrl ? (
            <img src={originalImageUrl} alt="Оригинал" style={previewImageStyle} />
          ) : (
            <div style={previewPlaceholderStyle}>Выбери изображение</div>
          )}
        </div>
      </div>

      <div style={previewPaneStyle}>
        <div style={previewPaneHeaderStyle}>Сетка</div>
        <div style={previewPaneBodyStyle}>
          {previewUrl ? (
            <img src={previewUrl} alt="Предпросмотр сетки" style={previewImageStyle} />
          ) : (
            <div style={previewPlaceholderStyle}>{previewStatusText}</div>
          )}

          {(isPreparing || isPreviewLoading || previewError) && (
            <div
              style={{
                ...previewStatusBadgeStyle,
                borderColor: previewError ? ds.color.danger : ds.color.border,
                color: previewError ? ds.color.danger : ds.color.textPrimary,
              }}
            >
              {previewStatusText}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          background: open ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0)",
          pointerEvents: open ? "auto" : "none",
          touchAction: "auto",
          transition: "background 0.24s ease",
          zIndex: 120,
        }}
      />

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          zIndex: 130,
          bottom: 0,
          transform: open
            ? `translate3d(0, -${sheetLayout.bottomOffset}px, 0)`
            : "translate3d(0, calc(100% + 24px), 0)",
          transition: open && sheetLayout.isViewportChanging
            ? "none"
            : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
          padding: "0 10px max(10px, env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px))",
          pointerEvents: open ? "auto" : "none",
          touchAction: "auto",
          willChange: open ? "transform" : undefined,
          backfaceVisibility: "hidden",
          transformStyle: "preserve-3d",
          overflow: "visible",
          contain: "layout style",
        }}
      >
        <div aria-hidden="true" style={getSheetKeyboardUnderlayStyle(sheetLayout)} />

        <div style={getSheetContainerStyle(sheetLayout, open)}>
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

          <div ref={sheetContentRef} style={getSheetContentStyle(sheetLayout.isKeyboardOpen)}>
            <div style={importInfoCardStyle}>
              <div style={importInfoTopStyle}>
                <div style={importInfoTitleStyle}>
                  {file?.name || "Обычная картинка"}
                </div>
                {file && <div style={importInfoMetaStyle}>{formatFileSize(file.size)}</div>}
              </div>
              <div style={importInfoTextStyle}>
                Подбери качество перед созданием: чем больше размер и цветов, тем ближе к фото, но сложнее сборка.
              </div>
            </div>

            <div style={getPreviewCardStyle(sheetLayout.isKeyboardOpen)}>{previewContent}</div>

            <div style={presetBlockStyle}>
              <div style={presetHeaderStyle}>
                <div style={sheetLabelStyle}>Быстрый выбор</div>
                <button
                  type="button"
                  onClick={resetToAutoSettings}
                  disabled={!defaultSettings || isPreparing}
                  style={{
                    ...autoButtonStyle,
                    opacity: defaultSettings && !isPreparing ? 1 : 0.45,
                  }}
                >
                  Авто
                </button>
              </div>

              <div style={presetRowStyle}>
                {GRID_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    disabled={!defaultSettings || isPreparing}
                    style={{
                      ...presetButtonStyle,
                      opacity: defaultSettings && !isPreparing ? 1 : 0.45,
                    }}
                  >
                    <span style={presetTitleStyle}>{preset.title}</span>
                    <span style={presetHintStyle}>{preset.hint}</span>
                  </button>
                ))}
              </div>
            </div>

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
                  style={{
                    ...sheetInputStyle,
                    border:
                      gridWidth === "" || isWidthValid
                        ? `1px solid ${ds.color.border}`
                        : `1px solid ${ds.color.danger}`,
                  }}
                />
                <div style={sheetHintStyle}>от 1 до 100</div>
              </div>

              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Высота</div>
                <input
                  value={gridHeight}
                  onChange={(event) =>
                    setGridHeight(sanitizeNumericInput(event.target.value))
                  }
                  onBlur={() =>
                    setGridHeight((prev) => clampGridValueOnBlur(prev))
                  }
                  inputMode="numeric"
                  placeholder="1"
                  style={{
                    ...sheetInputStyle,
                    border:
                      gridHeight === "" || isHeightValid
                        ? `1px solid ${ds.color.border}`
                        : `1px solid ${ds.color.danger}`,
                  }}
                />
                <div style={sheetHintStyle}>от 1 до 100</div>
              </div>
            </div>

            <div style={summaryCardStyle}>
              <div style={summaryItemStyle}>
                <div style={summaryLabelStyle}>Размер</div>
                <div style={summaryValueStyle}>
                  {gridCellCount ? `${gridWidth} × ${gridHeight}` : "—"}
                </div>
              </div>
              <div style={summaryItemStyle}>
                <div style={summaryLabelStyle}>Бусины</div>
                <div style={summaryValueStyle}>
                  {gridCellCount ? gridCellCount.toLocaleString("ru-RU") : "—"}
                </div>
              </div>
              <div style={summaryItemStyle}>
                <div style={summaryLabelStyle}>Сложность</div>
                <div style={summaryValueStyle}>{complexityLabel}</div>
              </div>
            </div>

            <div style={sheetStackStyle}>
              <div style={detailHeaderStyle}>
                <div>
                  <div style={sheetLabelStyle}>Детализация</div>
                  <div style={sheetHintStyle}>ниже — мягче, выше — больше мелких переходов</div>
                </div>
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
                  <div
                    style={{
                      ...detailSliderFillStyle,
                      width: `${detailPercent}%`,
                    }}
                  />
                  <div
                    style={{
                      ...detailSliderThumbStyle,
                      left: `${detailPercent}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={sheetStackStyle}>
              <div style={detailHeaderStyle}>
                <div>
                  <div style={sheetLabelStyle}>Количество цветов</div>
                  <div style={sheetHintStyle}>меньше — чище схема, больше — ближе к фото</div>
                </div>
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
                  <div
                    style={{
                      ...detailSliderFillStyle,
                      width: `${colorCountPercent}%`,
                    }}
                  />
                  <div
                    style={{
                      ...detailSliderThumbStyle,
                      left: `${colorCountPercent}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleCreate}
              style={{
                ...sheetCreateButtonStyle,
                opacity: canCreate ? 1 : 0.5,
                cursor: canCreate ? "pointer" : "not-allowed",
              }}
              type="button"
              disabled={!canCreate}
            >
              {createButtonText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const getSheetContainerStyle = (
  sheetLayout: {
    maxHeight: number;
    isKeyboardOpen: boolean;
    isViewportChanging: boolean;
  },
  open: boolean,
): React.CSSProperties => ({
  ...sheetContainerStyle,
  maxHeight: sheetLayout.maxHeight,
  willChange: sheetLayout.isKeyboardOpen ? "max-height" : undefined,
  transition: open && sheetLayout.isViewportChanging
    ? "none"
    : "max-height 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
});

const getSheetKeyboardUnderlayStyle = (sheetLayout: {
  bottomOffset: number;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
}): React.CSSProperties => {
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
    ? "0 16px max(28px, env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px))"
    : sheetContentStyle.padding,
});

const getPreviewCardStyle = (isKeyboardOpen: boolean): React.CSSProperties => ({
  ...previewCardStyle,
  minHeight: isKeyboardOpen ? 172 : previewCardStyle.minHeight,
  maxHeight: isKeyboardOpen ? 230 : previewCardStyle.maxHeight,
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
  padding: "0 16px max(18px, env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px))",
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

const importInfoCardStyle: React.CSSProperties = {
  borderRadius: ds.radius.xl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.045)",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const importInfoTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const importInfoTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const importInfoMetaStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  whiteSpace: "nowrap",
};

const importInfoTextStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  lineHeight: 1.35,
};

const previewCardStyle: React.CSSProperties = {
  minHeight: 230,
  maxHeight: 310,
  borderRadius: ds.radius.xxl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.04)",
  overflow: "hidden",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  padding: 10,
  boxSizing: "border-box",
};

const previewCompareStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  minHeight: 0,
};

const previewPaneStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const previewPaneHeaderStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
};

const previewPaneBodyStyle: React.CSSProperties = {
  position: "relative",
  flex: "1 1 auto",
  minHeight: 0,
  borderRadius: ds.radius.xl,
  background: "rgba(0,0,0,0.16)",
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
  lineHeight: 1.25,
  textAlign: "center",
  padding: 14,
};

const previewStatusBadgeStyle: React.CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  bottom: 8,
  borderRadius: ds.radius.pill,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(0,0,0,0.62)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  padding: "7px 10px",
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
};

const presetBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const presetHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const autoButtonStyle: React.CSSProperties = {
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.06)",
  color: ds.color.textPrimary,
  borderRadius: ds.radius.pill,
  padding: "8px 12px",
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  cursor: "pointer",
};

const presetRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const presetButtonStyle: React.CSSProperties = {
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.055)",
  borderRadius: ds.radius.xl,
  padding: "10px 8px",
  minHeight: 58,
  color: ds.color.textPrimary,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
};

const presetTitleStyle: React.CSSProperties = {
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
};

const presetHintStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  lineHeight: 1.15,
  textAlign: "center",
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

const summaryCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  borderRadius: ds.radius.xl,
  border: `1px solid ${ds.color.border}`,
  background: "rgba(255,255,255,0.04)",
  padding: 10,
};

const summaryItemStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  alignItems: "center",
};

const summaryLabelStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  lineHeight: 1.1,
};

const summaryValueStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};

const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const detailValueStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  whiteSpace: "nowrap",
  paddingTop: 2,
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

export default ImportImageSheet;
