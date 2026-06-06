/**
 * Экран проектов.
 *
 * Отображает полный список проектов. Экран хранит только UI-состояние,
 * например открытое меню действий проекта; изменения проектов передаются
 * наверх через callbacks.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCell from "../components/ProjectCell";
import type { AppTheme } from "../app/theme";
import type { GridProject } from "../entities/project/types";
import type { ProjectItem } from "../models/project";
import { THEME_TRANSITION, getThemeView } from "../utils/appTheme";

interface Props {
  projects: ProjectItem[];
  onProjectClick: (project: ProjectItem) => void;
  onRenameProject?: (project: ProjectItem) => void;
  onDeleteProject?: (project: ProjectItem) => void;
  savedProjects?: GridProject[];
  theme?: AppTheme;
}


const PROJECTS_TOP_SAFE_SPACE = "var(--app-safe-top, 0px)";

const ProjectsScreen: React.FC<Props> = ({
  projects,
  onProjectClick,
  onRenameProject,
  onDeleteProject,
  savedProjects = [],
  theme = "dark",
}) => {
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(
    null,
  );
  const hasProjects = projects.length > 0;
  const showActions = Boolean(onRenameProject || onDeleteProject);
  const themeView = getThemeView(theme);

  // Индексируем полные данные проектов по id, чтобы карточки быстро строили превью.
  const savedProjectsById = useMemo(() => {
    return new Map(savedProjects.map((project) => [project.id, project]));
  }, [savedProjects]);

  const toggleProjectMenu = useCallback((projectItem: ProjectItem) => {
    setOpenProjectMenuId((currentId) =>
      currentId === projectItem.id ? null : projectItem.id,
    );
  }, []);

  const renameProjectFromMenu = useCallback((projectItem: ProjectItem) => {
    setOpenProjectMenuId(null);
    onRenameProject?.(projectItem);
  }, [onRenameProject]);

  const deleteProjectFromMenu = useCallback((projectItem: ProjectItem) => {
    setOpenProjectMenuId(null);
    onDeleteProject?.(projectItem);
  }, [onDeleteProject]);

  // Закрываем меню действий, когда пользователь нажимает вне него.
  useEffect(() => {
    if (!openProjectMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest('[data-project-menu-root="true"]')
      ) {
        return;
      }

      setOpenProjectMenuId(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openProjectMenuId]);

  return (
    <div style={projectsRootStyle}>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ ...ui.screenTitle, color: themeView.textPrimary, margin: 0 }}>
              Проекты
            </h1>
            {hasProjects && (
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: themeView.textSecondary,
                background: themeView.isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                border: `1px solid ${themeView.border}`,
                borderRadius: 8,
                padding: "2px 8px",
                letterSpacing: 0.2,
              }}>
                {projects.length}
              </span>
            )}
          </div>
        </div>
      </section>

      <div style={projectsScrollAreaStyle} className="app-scroll">
        <section style={projectsSectionStyle}>
          {hasProjects ? (
            <div style={projectsListStyle}>
              {projects.map((project) => (
                <ProjectCell
                  key={project.id}
                  projectItem={project}
                  project={savedProjectsById.get(project.id)}
                  theme={theme}
                  showActions={showActions}
                  isMenuOpen={openProjectMenuId === project.id}
                  onClick={onProjectClick}
                  onMenuToggle={toggleProjectMenu}
                  onRenameProject={onRenameProject ? renameProjectFromMenu : undefined}
                  onDeleteProject={onDeleteProject ? deleteProjectFromMenu : undefined}
                />
              ))}
            </div>
          ) : (
            <section style={emptyStateStyle}>
              <div style={{ ...emptyIconStyle, color: themeView.textSecondary }}>
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
                  <rect x="9" y="15" width="34" height="26" rx="6" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.25"/>
                  <rect x="15" y="9" width="22" height="6" rx="3" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.18"/>
                  <path d="M18 27h16M18 33h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.28"/>
                  <circle cx="40" cy="12" r="6.5" fill="var(--primary)" fillOpacity="0.12" stroke="var(--primary)" strokeWidth="1.4"/>
                  <path d="M40 9.5V12.5L41.8 14" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ ...emptyTitleStyle, color: themeView.textSecondary }}>
                Проектов пока нет
              </div>
              <div style={{ ...emptySubtitleStyle, color: themeView.textSecondary }}>
                Вернись на главную и создай первую схему
              </div>
            </section>
          )}
        </section>
      </div>
    </div>
  );
};

const projectsRootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  paddingTop: PROJECTS_TOP_SAFE_SPACE,
  boxSizing: "border-box",
  background: "transparent",
  overflow: "hidden",
};

const projectsScrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  minHeight: 0,
  width: "100%",
  maxWidth: 520,
  alignSelf: "center",
  background: "transparent",
};

const secondaryHeroWrapStyle: React.CSSProperties = {
  // Верхний safe уже ставится родительским scroll-контейнером.
  // Здесь оставляем только нижний визуальный зазор, чтобы не было safe + gap сверху.
  paddingTop: 0,
  paddingBottom: "var(--app-home-section-gap, 10px)",
};

const secondaryHeroTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--app-home-text-gap, 6px)",
  paddingLeft: 2,
};

const projectsSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--app-home-section-gap, 14px)",
  paddingTop: 2,
};

const projectsListStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "var(--app-project-list-gap, 12px)",
  padding: "0 2px calc(var(--app-tg-content-safe-area-inset-bottom, 0px) + 112px)",
};

const emptyStateStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  minHeight: "42vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "var(--app-page-x, 24px)",
  textAlign: "center",
};

const emptyIconStyle: React.CSSProperties = {
  opacity: 0.7,
  marginBottom: 4,
};

const emptyTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.2,
};

const emptySubtitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.medium,
  lineHeight: 1.4,
  opacity: 0.55,
};

export default React.memo(ProjectsScreen);
