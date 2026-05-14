import React from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";

export type ResizeHorizontalAnchor = "left" | "center" | "right";
export type ResizeVerticalAnchor = "top" | "center" | "bottom";

const HORIZONTAL_ANCHOR_OPTIONS: Array<{ value: ResizeHorizontalAnchor; label: string }> = [
  { value: "left", label: "Слева" },
  { value: "center", label: "Центр" },
  { value: "right", label: "Справа" },
];

const VERTICAL_ANCHOR_OPTIONS: Array<{ value: ResizeVerticalAnchor; label: string }> = [
  { value: "top", label: "Сверху" },
  { value: "center", label: "Центр" },
  { value: "bottom", label: "Снизу" },
];

interface Props {
  open: boolean;
  projectName: string;
  gridWidth: string;
  gridHeight: string;
  isProjectNameValid: boolean;
  isWidthValid: boolean;
  isHeightValid: boolean;
  isCreateDisabled: boolean;
  onClose: () => void;
  onCreate: () => void;
  onProjectNameChange: (value: string) => void;
  onGridWidthChange: (value: string) => void;
  onGridHeightChange: (value: string) => void;
  onGridWidthBlur: () => void;
  onGridHeightBlur: () => void;
  title?: string;
  submitText?: string;
  hideProjectName?: boolean;
  resizeHorizontalAnchor?: ResizeHorizontalAnchor;
  resizeVerticalAnchor?: ResizeVerticalAnchor;
  onResizeHorizontalAnchorChange?: (value: ResizeHorizontalAnchor) => void;
  onResizeVerticalAnchorChange?: (value: ResizeVerticalAnchor) => void;
}

const CreateProjectSheet: React.FC<Props> = ({
  open,
  projectName,
  gridWidth,
  gridHeight,
  isProjectNameValid,
  isWidthValid,
  isHeightValid,
  isCreateDisabled,
  onClose,
  onCreate,
  onProjectNameChange,
  onGridWidthChange,
  onGridHeightChange,
  onGridWidthBlur,
  onGridHeightBlur,
  title = "Новый проект",
  submitText = "Создать",
  hideProjectName = false,
  resizeHorizontalAnchor = "center",
  resizeVerticalAnchor = "center",
  onResizeHorizontalAnchorChange,
  onResizeVerticalAnchorChange,
}) => {
  const shouldShowResizeAnchors = Boolean(
    onResizeHorizontalAnchorChange && onResizeVerticalAnchorChange,
  );

  return (
    <>
      <div
        onClick={onClose}
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
            <button onClick={onClose} type="button" style={closeIconButtonStyle}>
              ✕
            </button>

            <div style={sheetHeaderTitleStyle}>{title}</div>

            <div />
          </div>

          <div style={sheetContentStyle}>
            {!hideProjectName && (
              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Имя проекта</div>
                <input
                  value={projectName}
                  onChange={(e) => onProjectNameChange(e.target.value)}
                  placeholder="Введите имя проекта"
                  style={{
                    ...sheetInputStyle,
                    border: isProjectNameValid
                      ? `1px solid ${ds.color.border}`
                      : "1px solid rgba(255,255,255,0.14)",
                  }}
                />
              </div>
            )}

            <div style={sheetFieldsRowStyle}>
              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Ширина</div>
                <input
                  value={gridWidth}
                  onChange={(e) => onGridWidthChange(e.target.value)}
                  onBlur={onGridWidthBlur}
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
                <div style={sheetHintStyle}>от 1 до 100, по крестикам</div>
              </div>

              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Длина</div>
                <input
                  value={gridHeight}
                  onChange={(e) => onGridHeightChange(e.target.value)}
                  onBlur={onGridHeightBlur}
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
                <div style={sheetHintStyle}>от 1 до 100, по крестикам</div>
              </div>
            </div>

            {shouldShowResizeAnchors && onResizeHorizontalAnchorChange && onResizeVerticalAnchorChange ? (
              <div style={resizeAnchorCardStyle}>
                <div style={resizeAnchorHeaderStyle}>
                  <div style={resizeAnchorTitleStyle}>С какой стороны менять</div>
                  <div style={resizeAnchorHintStyle}>
                    При увеличении добавит кружки, при уменьшении — уберёт.
                  </div>
                </div>

                <ResizeSegmentedControl
                  label="Ширина"
                  options={HORIZONTAL_ANCHOR_OPTIONS}
                  value={resizeHorizontalAnchor}
                  onChange={onResizeHorizontalAnchorChange}
                />

                <ResizeSegmentedControl
                  label="Длина"
                  options={VERTICAL_ANCHOR_OPTIONS}
                  value={resizeVerticalAnchor}
                  onChange={onResizeVerticalAnchorChange}
                />
              </div>
            ) : null}

            <button
              onClick={onCreate}
              style={{
                ...sheetCreateButtonStyle,
                opacity: isCreateDisabled ? 0.5 : 1,
                cursor: isCreateDisabled ? "not-allowed" : "pointer",
              }}
              type="button"
              disabled={isCreateDisabled}
            >
              {submitText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

const ResizeSegmentedControl = <T extends string,>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) => (
  <div style={resizeControlStyle}>
    <div style={resizeControlLabelStyle}>{label}</div>

    <div style={resizeSegmentGroupStyle}>
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              ...resizeSegmentButtonStyle,
              ...(isActive ? resizeSegmentButtonActiveStyle : null),
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);

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
  background: ds.color.surfaceStrong,
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
  background: ds.color.borderStrong,
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
  color: ds.color.textTertiary,
  fontSize: ds.font.caption,
  lineHeight: 1.2,
};

const sheetInputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
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

const resizeAnchorCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  borderRadius: ds.radius.xxl,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
};

const resizeAnchorHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const resizeAnchorTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
};

const resizeAnchorHintStyle: React.CSSProperties = {
  color: ds.color.textTertiary,
  fontSize: ds.font.caption,
  lineHeight: 1.25,
};

const resizeControlStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr",
  gap: 10,
  alignItems: "center",
};

const resizeControlLabelStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
};

const resizeSegmentGroupStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
  padding: 4,
  borderRadius: ds.radius.xl,
  background: ds.color.inputBg,
  border: `1px solid ${ds.color.border}`,
};

const resizeSegmentButtonStyle: React.CSSProperties = {
  height: 36,
  border: "none",
  borderRadius: ds.radius.lg,
  background: "transparent",
  color: ds.color.textTertiary,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  padding: "0 8px",
  touchAction: "manipulation",
};

const resizeSegmentButtonActiveStyle: React.CSSProperties = {
  background: ds.color.primaryButtonBg,
  color: ds.color.textPrimary,
  boxShadow: `inset 0 0 0 1px ${ds.color.borderStrong}`,
};

export default CreateProjectSheet;