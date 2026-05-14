import React, { useEffect, useMemo, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCell from "../components/ProjectCell";
import type { AppTheme, GridProject } from "../App";
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

  const savedProjectsById = useMemo(() => {
    return new Map(savedProjects.map((project) => [project.id, project]));
  }, [savedProjects]);

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
                onMenuToggle={(projectItem) => {
                  setOpenProjectMenuId((currentId) =>
                    currentId === projectItem.id ? null : projectItem.id,
                  );
                }}
                onRenameProject={
                  onRenameProject
                    ? (projectItem) => {
                        setOpenProjectMenuId(null);
                        onRenameProject(projectItem);
                      }
                    : undefined
                }
                onDeleteProject={
                  onDeleteProject
                    ? (projectItem) => {
                        setOpenProjectMenuId(null);
                        onDeleteProject(projectItem);
                      }
                    : undefined
                }
              />
            ))}
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
