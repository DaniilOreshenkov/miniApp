import React, { useCallback, useMemo } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { AppTheme } from "../app/theme";
import type { GridProject } from "../entities/project/types";
import type { ProjectItem } from "../models/project";
import { THEME_TRANSITION, getThemeView } from "../utils/appTheme";
import { createProjectPreviewDots } from "../utils/projectPreview";

type Props = {
  projectItem: ProjectItem;
  project?: GridProject;
  theme?: AppTheme;
  showActions?: boolean;
  onClick: (project: ProjectItem) => void;
  onMenuOpen?: (project: ProjectItem) => void;
};

const ProjectCell: React.FC<Props> = ({
  projectItem,
  project,
  theme = "dark",
  showActions = false,
  onClick,
  onMenuOpen,
}) => {
  const themeView = getThemeView(theme);
  const canShowProjectMenu = Boolean(showActions && onMenuOpen);

  const handleProjectClick = useCallback(() => {
    onClick(projectItem);
  }, [onClick, projectItem]);

  const handleProjectKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick(projectItem);
  }, [onClick, projectItem]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canShowProjectMenu) return;
    onMenuOpen?.(projectItem);
  }, [canShowProjectMenu, onMenuOpen, projectItem]);

  return (
    <div
      key={projectItem.id}
      role="button"
      tabIndex={0}
      style={{
        ...projectCellStyle,
        background: themeView.cardStrong,
        border: `1px solid ${themeView.border}`,
        color: themeView.textPrimary,
        boxShadow: themeView.shadow,
      }}
      onClick={handleProjectClick}
      onKeyDown={handleProjectKeyDown}
    >
      <div
        style={{
          ...projectPreviewStyle,
          background: themeView.previewBg,
          border: `1px solid ${themeView.previewBorder}`,
        }}
      >
        <ProjectPreview project={project} theme={theme} />
      </div>

      <div style={projectCellTextStyle}>
        <div style={{ ...projectCellTitleStyle, color: themeView.textPrimary }}>
          {projectItem.title}
        </div>
        <div
          style={{
            ...projectCellSubtitleStyle,
            color: themeView.textSecondary,
          }}
        >
          {projectItem.subtitle}
        </div>
      </div>

      <div
        style={{ ...projectCellMetaStyle, color: themeView.textSecondary }}
      >
        <button
          type="button"
          onClick={handleMenuOpen}
          disabled={!canShowProjectMenu}
          aria-label="Открыть меню проекта"
          title="Меню"
          style={{
            ...projectCellDotsButtonStyle,
            color: themeView.textSecondary,
            opacity: canShowProjectMenu ? 1 : 0.38,
            pointerEvents: canShowProjectMenu ? "auto" : "none",
          }}
        >
          <span style={projectCellDotsStyle}>•••</span>
        </button>

        <div
          style={{ ...projectCellDateStyle, color: themeView.textSecondary }}
        >
          {projectItem.updatedAt}
        </div>
      </div>
    </div>
  );
};

const ProjectPreview = React.memo(({
  project,
  theme,
}: {
  project?: GridProject;
  theme: AppTheme;
}) => {
  const themeView = getThemeView(theme);
  const dots = useMemo(() => {
    if (!project || project.cells.length === 0) return [];
    return createProjectPreviewDots(project);
  }, [project]);

  if (!project || project.cells.length === 0) {
    return (
      <div style={projectPreviewPlaceholderStyle}>
        <span style={projectPreviewPlaceholderDotStyle} />
        <span style={projectPreviewPlaceholderDotStyle} />
        <span style={projectPreviewPlaceholderDotStyle} />
        <span style={projectPreviewPlaceholderDotStyle} />
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      style={projectPreviewSvgStyle}
      aria-hidden="true"
    >
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx="22"
        fill={themeView.previewBg}
      />
      {dots.map((dot) => (
        <circle
          key={dot.key}
          cx={dot.x}
          cy={dot.y}
          r={3.2}
          fill={dot.color}
          opacity={dot.isWhite ? 0.38 : 1}
          stroke={
            dot.isWhite
              ? themeView.isLight
                ? "rgba(28,28,30,0.16)"
                : "rgba(255,255,255,0.28)"
              : "rgba(0,0,0,0.18)"
          }
          strokeWidth={0.9}
        />
      ))}
    </svg>
  );
});

ProjectPreview.displayName = "ProjectPreview";

const projectCellStyle: React.CSSProperties = {
  ...ui.glassCard,
  transition: `${THEME_TRANSITION}, transform 180ms ease`,
  width: "100%",
  minHeight: 82,
  padding: "10px 12px",
  borderRadius: 22,
  display: "grid",
  gridTemplateColumns: "64px 1fr auto",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  cursor: "pointer",
  color: ds.color.textPrimary,
  border: `1px solid ${ds.color.border}`,
  boxSizing: "border-box",
  transform: "translateZ(0)",
  WebkitUserSelect: "none",
  userSelect: "none",
};

const projectPreviewStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  transition: THEME_TRANSITION,
  borderRadius: 18,
  overflow: "hidden",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const projectPreviewSvgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
};

const projectPreviewPlaceholderStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 6,
  padding: 12,
  boxSizing: "border-box",
};

const projectPreviewPlaceholderDotStyle: React.CSSProperties = {
  borderRadius: "50%",
  background: "rgba(255,255,255,0.36)",
};

const projectCellTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const projectCellTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: ds.color.textPrimary,
  fontSize: 17,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectCellSubtitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectCellMetaStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 3,
  transition: THEME_TRANSITION,
  minWidth: 76,
  height: 58,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  alignItems: "flex-end",
  color: ds.color.textSecondary,
};

const projectCellDotsButtonStyle: React.CSSProperties = {
  width: 36,
  height: 28,
  minHeight: 28,
  padding: 0,
  border: "none",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "none",
  cursor: "pointer",
  transition: THEME_TRANSITION,
  WebkitTapHighlightColor: "transparent",
};

const projectCellDotsStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: "currentColor",
  fontSize: 18,
  fontWeight: ds.weight.bold,
  lineHeight: 1,
  letterSpacing: 1.5,
  transform: "translateY(-2px)",
};

const projectCellDateStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
};

export default React.memo(ProjectCell);
