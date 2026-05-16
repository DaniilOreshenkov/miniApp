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
  isMenuOpen?: boolean;
  showActions?: boolean;
  onClick: (project: ProjectItem) => void;
  onMenuToggle?: (project: ProjectItem) => void;
  onRenameProject?: (project: ProjectItem) => void;
  onDeleteProject?: (project: ProjectItem) => void;
};

const ProjectCell: React.FC<Props> = ({
  projectItem,
  project,
  theme = "dark",
  isMenuOpen = false,
  showActions = false,
  onClick,
  onMenuToggle,
  onRenameProject,
  onDeleteProject,
}) => {
  const themeView = getThemeView(theme);
  const canShowProjectMenu = Boolean(
    showActions && project && (onRenameProject || onDeleteProject),
  );

  const handleProjectClick = useCallback(() => {
    onClick(projectItem);
  }, [onClick, projectItem]);

  const handleProjectKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    onClick(projectItem);
  }, [onClick, projectItem]);

  const handleMenuToggle = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canShowProjectMenu) return;

    onMenuToggle?.(projectItem);
  }, [canShowProjectMenu, onMenuToggle, projectItem]);

  const handleRenameClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    onRenameProject?.(projectItem);
  }, [onRenameProject, projectItem]);

  const handleDeleteClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    onDeleteProject?.(projectItem);
  }, [onDeleteProject, projectItem]);

  return (
    <div
      key={projectItem.id}
      role="button"
      tabIndex={0}
      style={{
        ...projectCellStyle,
        zIndex: isMenuOpen ? 120 : 1,
        overflow: "visible",
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
        data-project-menu-root="true"
        style={{ ...projectCellMetaStyle, color: themeView.textSecondary }}
      >
        <button
          type="button"
          onClick={handleMenuToggle}
          disabled={!canShowProjectMenu}
          aria-label="Открыть меню проекта"
          title="Меню"
          style={{
            ...projectCellDotsButtonStyle,
            color: themeView.textSecondary,
            background: isMenuOpen
              ? themeView.isLight
                ? "rgba(119,86,223,0.12)"
                : "rgba(255,255,255,0.10)"
              : "transparent",
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

        {canShowProjectMenu && isMenuOpen ? (
          <div
            style={{
              ...projectMenuStyle,
              background: themeView.cardStrong,
              border: `1px solid ${themeView.border}`,
              boxShadow: themeView.isLight
                ? "0 18px 42px rgba(28,28,30,0.16)"
                : "0 18px 42px rgba(0,0,0,0.38)",
            }}
          >
            {onRenameProject ? (
              <button
                type="button"
                onClick={handleRenameClick}
                style={{
                  ...projectMenuButtonStyle,
                  color: themeView.textPrimary,
                }}
              >
                Переименовать
              </button>
            ) : null}

            {onRenameProject && onDeleteProject ? (
              <div
                style={{
                  ...projectMenuDividerStyle,
                  background: themeView.border,
                }}
              />
            ) : null}

            {onDeleteProject ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                style={{ ...projectMenuButtonStyle, color: "var(--danger)" }}
              >
                Удалить
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const ProjectPreview = ({
  project,
  theme,
}: {
  project?: GridProject;
  theme: AppTheme;
}) => {
  const themeView = getThemeView(theme);

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

  const dots = useMemo(() => {
    return createProjectPreviewDots(project);
  }, [project]);

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
};

const projectCellStyle: React.CSSProperties = {
  ...ui.glassCard,
  position: "relative",
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

const projectMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: 32,
  right: 0,
  zIndex: 240,
  width: 176,
  padding: 6,
  borderRadius: 18,
  overflow: "hidden",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  transform: "translateZ(0)",
  pointerEvents: "auto",
};

const projectMenuButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "0 12px",
  border: "none",
  borderRadius: 12,
  background: "transparent",
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  textAlign: "left",
  fontSize: 14,
  fontWeight: ds.weight.bold,
  cursor: "pointer",
};

const projectMenuDividerStyle: React.CSSProperties = {
  width: "100%",
  height: 1,
  margin: "4px 0",
  opacity: 0.74,
};

export default React.memo(ProjectCell);
