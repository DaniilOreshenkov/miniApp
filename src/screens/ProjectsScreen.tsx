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

const PROJECTS_TOP_SAFE_SPACE =
  "var(--app-tg-content-safe-area-inset-top, var(--tg-content-safe-area-inset-top, 0px))";

const PROJECTS_BOTTOM_SAFE_SPACE =
  "var(--app-tg-content-safe-area-inset-bottom, var(--tg-content-safe-area-inset-bottom, 0px))";

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
            <div style={{ ...emptyTitleStyle, color: themeView.textSecondary }}>
              Здесь появятся ваши проекты
            </div>
          </section>
        )}
      </section>
    </>
  );
};

const secondaryHeroWrapStyle: React.CSSProperties = {
  // Экран проектов сам отвечает за верхний Telegram content safe.
  // Родительский контейнер не должен добавлять top-safe для вкладки projects,
  // иначе получится двойной отступ.
  paddingTop: PROJECTS_TOP_SAFE_SPACE,
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
  padding: `0 2px calc(${PROJECTS_BOTTOM_SAFE_SPACE} + var(--app-list-bottom-gap, 10px))`,
};

const emptyStateStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  minHeight: "42vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--app-page-x, 24px)",
  textAlign: "center",
};

const emptyTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: "var(--app-section-title-size, 22px)",
  fontWeight: ds.weight.semibold,
  lineHeight: 1.2,
};

export default React.memo(ProjectsScreen);
