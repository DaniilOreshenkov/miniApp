import React, { useEffect, useMemo, useState } from "react";
import { ui } from "../design-system/ui";
import { ds } from "../design-system/tokens";
import type { AppTheme, GridProject } from "../App";
import type { ProjectItem } from "../models/project";

interface Props {
  projects: ProjectItem[];
  onProjectClick: (project: ProjectItem) => void;
  onRenameProject?: (project: ProjectItem) => void;
  onDeleteProject?: (project: ProjectItem) => void;
  savedProjects?: GridProject[];
  theme?: AppTheme;
}

const THEME_TRANSITION =
  "background 260ms ease, background-color 260ms ease, color 260ms ease, border-color 260ms ease, box-shadow 260ms ease, opacity 260ms ease, filter 260ms ease";

const getThemeView = (theme: AppTheme = "dark") => {
  const isLight = theme === "light";

  return {
    isLight,
    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    cardStrong: "var(--surface-strong)",
    border: "var(--border)",
    previewBg: isLight ? "rgba(28,28,30,0.04)" : "rgba(255,255,255,0.06)",
    previewBorder: "var(--border)",
    shadow: "var(--shadow-card)",
  };
};

const getRowCount = (height: number) => {
  return Math.max(1, height) * 2 + 1;
};

const getRowLength = (width: number, rowIndex: number) => {
  const safeWidth = Math.max(1, width);
  return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
};

const getRowStartIndex = (width: number, targetRowIndex: number) => {
  let startIndex = 0;

  for (let rowIndex = 0; rowIndex < targetRowIndex; rowIndex += 1) {
    startIndex += getRowLength(width, rowIndex);
  }

  return startIndex;
};

const isWhiteCell = (color: string) => {
  const normalized = color.trim().toLowerCase();
  return (
    normalized === "#fff" || normalized === "#ffffff" || normalized === "white"
  );
};

const ProjectsScreen: React.FC<Props> = ({
  projects,
  onProjectClick,
  onRenameProject,
  onDeleteProject,
  savedProjects = [],
  theme = "dark",
}) => {
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const hasProjects = projects.length > 0;
  const showActions = Boolean(onRenameProject || onDeleteProject);
  const themeView = getThemeView(theme);

  const savedProjectsById = useMemo(() => {
    return new Map(savedProjects.map((project) => [project.id, project]));
  }, [savedProjects]);

  useEffect(() => {
    if (!openProjectMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Element && target.closest('[data-project-menu-root="true"]')) {
        return;
      }

      setOpenProjectMenuId(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openProjectMenuId]);

  const renderProjectPreview = (project?: GridProject) => {
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

    const rowCount = getRowCount(project.height);
    const maxPreviewRows = 13;
    const maxPreviewColumns = 14;
    const rowStep = Math.max(1, Math.ceil(rowCount / maxPreviewRows));
    const dots: Array<{
      key: string;
      x: number;
      y: number;
      color: string;
      isWhite: boolean;
    }> = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += rowStep) {
      const rowLength = getRowLength(project.width, rowIndex);
      const rowStartIndex = getRowStartIndex(project.width, rowIndex);
      const columnStep = Math.max(1, Math.ceil(rowLength / maxPreviewColumns));

      for (let cellIndex = 0; cellIndex < rowLength; cellIndex += columnStep) {
        const color = project.cells[rowStartIndex + cellIndex] ?? "#ffffff";
        const x = 8 + (cellIndex / Math.max(1, rowLength - 1)) * 84;
        const y = 8 + (rowIndex / Math.max(1, rowCount - 1)) * 84;

        dots.push({
          key: `${rowIndex}-${cellIndex}`,
          x,
          y,
          color,
          isWhite: isWhiteCell(color),
        });
      }
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
  };

  const handleProjectCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    projectItem: ProjectItem,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    onProjectClick(projectItem);
  };

  const renderProjectCell = (projectItem: ProjectItem) => {
    const savedProject = savedProjectsById.get(projectItem.id);
    const canShowProjectMenu = Boolean(showActions && savedProject);
    const isMenuOpen = openProjectMenuId === projectItem.id;

    const handleMenuToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!canShowProjectMenu) return;

      setOpenProjectMenuId((currentId) =>
        currentId === projectItem.id ? null : projectItem.id,
      );
    };

    const handleRenameClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      setOpenProjectMenuId(null);
      onRenameProject?.(projectItem);
    };

    const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      setOpenProjectMenuId(null);
      onDeleteProject?.(projectItem);
    };

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
        onClick={() => onProjectClick(projectItem)}
        onKeyDown={(event) => handleProjectCellKeyDown(event, projectItem)}
      >
        <div
          style={{
            ...projectPreviewStyle,
            background: themeView.previewBg,
            border: `1px solid ${themeView.previewBorder}`,
          }}
        >
          {renderProjectPreview(savedProject)}
        </div>

        <div style={projectCellTextStyle}>
          <div
            style={{ ...projectCellTitleStyle, color: themeView.textPrimary }}
          >
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
                  style={{
                    ...projectMenuButtonStyle,
                    color: "var(--danger)",
                  }}
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

  return (
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={{ ...ui.screenTitle, color: themeView.textPrimary }}>
            Проекты
          </h1>
        </div>
      </section>

      <section style={projectsSectionStyle}>
        {hasProjects ? (
          <div style={projectsListStyle}>
            {projects.map((project) => renderProjectCell(project))}
          </div>
        ) : (
          <section
            style={{
              ...emptyStateStyle,
              background: themeView.cardStrong,
              border: `1px solid ${themeView.border}`,
              boxShadow: themeView.shadow,
            }}
          >
            <div style={emptyIconStyle}>📁</div>
            <h2 style={{ ...emptyTitleStyle, color: themeView.textPrimary }}>
              Пока нет проектов
            </h2>
            <p style={{ ...emptyTextStyle, color: themeView.textSecondary }}>
              Создай первую сетку и она появится здесь.
            </p>
          </section>
        )}
      </section>
    </>
  );
};

const secondaryHeroWrapStyle: React.CSSProperties = {
  paddingTop: 22,
  paddingBottom: 10,
};

const secondaryHeroTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingLeft: 2,
};

const projectsSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 2,
};

const projectsListStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "0 2px 10px",
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

const emptyStateStyle: React.CSSProperties = {
  ...ui.glassCard,
  transition: THEME_TRANSITION,
  minHeight: "56vh",
  borderRadius: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: 24,
  textAlign: "center",
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 14,
};

const emptyTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  margin: 0,
  color: ds.color.textPrimary,
  fontSize: ds.font.sectionTitle,
  fontWeight: ds.weight.bold,
};

const emptyTextStyle: React.CSSProperties = {
  ...ui.bodyText,
  transition: THEME_TRANSITION,
  margin: "10px 0 0",
  maxWidth: 320,
};

export default ProjectsScreen;
