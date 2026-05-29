/**
 * Экран проектов.
 *
 * Отображает полный список проектов. Экран хранит только UI-состояние
 * (action sheet); изменения проектов передаются наверх через callbacks.
 */

import React, { useCallback, useMemo, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCell from "../components/ProjectCell";
import AppActionSheet from "../components/AppActionSheet";
import type { ActionSheetAction } from "../components/AppActionSheet";
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
  const [actionSheetProject, setActionSheetProject] = useState<ProjectItem | null>(null);

  const hasProjects = projects.length > 0;
  const showActions = Boolean(onRenameProject || onDeleteProject);
  const themeView = getThemeView(theme);

  const savedProjectsById = useMemo(() => {
    return new Map(savedProjects.map((project) => [project.id, project]));
  }, [savedProjects]);

  const openActionSheet = useCallback((projectItem: ProjectItem) => {
    setActionSheetProject(projectItem);
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheetProject(null);
  }, []);

  const actionSheetActions = useMemo((): ActionSheetAction[] => {
    if (!actionSheetProject) return [];
    const actions: ActionSheetAction[] = [];

    if (onRenameProject) {
      actions.push({
        label: "Переименовать",
        style: "default",
        onPress: () => onRenameProject(actionSheetProject),
      });
    }

    if (onDeleteProject) {
      actions.push({
        label: "Удалить",
        style: "destructive",
        onPress: () => onDeleteProject(actionSheetProject),
      });
    }

    actions.push({
      label: "Отмена",
      style: "cancel",
      onPress: () => {},
    });

    return actions;
  }, [actionSheetProject, onDeleteProject, onRenameProject]);

  return (
    <div style={projectsRootStyle}>
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
                onClick={onProjectClick}
                onMenuOpen={openActionSheet}
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

      <AppActionSheet
        open={Boolean(actionSheetProject)}
        theme={theme}
        title={actionSheetProject?.title}
        subtitle={actionSheetProject?.subtitle}
        actions={actionSheetActions}
        onClose={closeActionSheet}
      />
    </div>
  );
};

const projectsRootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: "100%",
  paddingTop: PROJECTS_TOP_SAFE_SPACE,
  boxSizing: "border-box",
};

const secondaryHeroWrapStyle: React.CSSProperties = {
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
  padding: "0 2px calc(var(--app-tg-content-safe-area-inset-bottom, 0px) + var(--app-list-bottom-gap, 10px))",
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
