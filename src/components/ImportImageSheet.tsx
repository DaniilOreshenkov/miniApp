import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { GridSeed } from "../App";
import {
  createImageImportPreview,
  getDefaultImageImportSettings,
  type ImageImportSettings,
} from "../projectPng";

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

const ImportImageSheet: React.FC<Props> = ({ open, file, onClose, onCreate }) => {
  const [gridWidth, setGridWidth] = useState("30");
  const [gridHeight, setGridHeight] = useState("30");
  const [detail, setDetail] = useState(70);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<GridSeed | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const requestIdRef = useRef(0);

  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const canCreate = Boolean(file && previewSeed && isWidthValid && isHeightValid);

  const detailLabel = useMemo(() => {
    if (detail < 35) return "простая";
    if (detail < 75) return "обычная";
    return "детальная";
  }, [detail]);

  useEffect(() => {
    if (!open || !file) return;

    let cancelled = false;

    const prepareDefaults = async () => {
      try {
        setIsPreparing(true);
        const defaults = await getDefaultImageImportSettings(file);

        if (cancelled) return;

        setGridWidth(String(defaults.width));
        setGridHeight(String(defaults.height));
        setDetail(defaults.detail);
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
    if (!open || !file || !isWidthValid || !isHeightValid) {
      setPreviewUrl(null);
      setPreviewSeed(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timerId = window.setTimeout(() => {
      const settings: ImageImportSettings = {
        width: Number(gridWidth),
        height: Number(gridHeight),
        detail,
      };

      createImageImportPreview(file, settings)
        .then((preview) => {
          if (requestIdRef.current !== requestId) return;
          setPreviewUrl(preview.previewUrl);
          setPreviewSeed(preview.seed);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setPreviewUrl(null);
          setPreviewSeed(null);
        });
    }, 180);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [detail, file, gridHeight, gridWidth, isHeightValid, isWidthValid, open]);

  const handleClose = () => {
    if (isCreating) return;
    onClose();
  };

  const handleCreate = async () => {
    if (!canCreate || !file) return;

    try {
      setIsCreating(true);
      const preview = await createImageImportPreview(file, {
        width: Number(gridWidth),
        height: Number(gridHeight),
        detail,
      });
      onCreate(preview.seed);
    } catch {
      window.alert("Не удалось создать сетку из изображения");
    } finally {
      setIsCreating(false);
    }
  };

  const previewContent = previewUrl ? (
    <img src={previewUrl} alt="Предпросмотр сетки" style={previewImageStyle} />
  ) : (
    <div style={previewPlaceholderStyle}>
      {isPreparing ? "Готовим изображение..." : "Меняй размер и детализацию"}
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
          transition: "background 0.24s ease",
          zIndex: 120,
        }}
      />

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 130,
          transform: open ? "translateY(0)" : "translateY(105%)",
          transition: "transform 0.26s ease",
          padding: "0 10px max(10px, env(safe-area-inset-bottom))",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div style={sheetContainerStyle}>
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

          <div style={sheetContentStyle}>
            <div style={previewCardStyle}>{previewContent}</div>

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
                <div style={sheetLabelStyle}>Длина</div>
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

            <div style={sheetStackStyle}>
              <div style={detailHeaderStyle}>
                <div style={sheetLabelStyle}>Детализация</div>
                <div style={detailValueStyle}>
                  {detail}% • {detailLabel}
                </div>
              </div>

              <input
                type="range"
                min={MIN_DETAIL}
                max={MAX_DETAIL}
                value={detail}
                onChange={(event) =>
                  setDetail(
                    clampNumber(Number(event.target.value), MIN_DETAIL, MAX_DETAIL),
                  )
                }
                style={rangeStyle}
              />
            </div>

            <button
              onClick={handleCreate}
              style={{
                ...sheetCreateButtonStyle,
                opacity: canCreate && !isCreating ? 1 : 0.5,
                cursor: canCreate && !isCreating ? "pointer" : "not-allowed",
              }}
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
  background: "#1b1d22",
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
  display: "flex",
  flexDirection: "column",
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
  padding: "0 16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
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

const rangeStyle: React.CSSProperties = {
  width: "100%",
  accentColor: "#AF52DE",
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
