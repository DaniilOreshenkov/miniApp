import React from "react";
import { ui } from "../design-system/ui";
import { ds } from "../design-system/tokens";
import ProjectCard from "../components/ProjectCard";
import type { ProjectItem } from "../models/project";

interface Props {
  projects: ProjectItem[];
  onProjectClick: (project: ProjectItem) => void;
  onRenameProject?: (project: ProjectItem) => void;
  onDeleteProject?: (project: ProjectItem) => void;
}

const ProjectsScreen: React.FC<Props> = ({
  projects,
  onProjectClick,
  onRenameProject,
  onDeleteProject,
}) => {
  const hasProjects = projects.length > 0;
  const showActions = Boolean(onRenameProject || onDeleteProject);

  return (
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={ui.screenTitle}>Проекты</h1>
        </div>
      </section>

      <section style={projectsSectionStyle}>
        {hasProjects ? (
          <div style={projectsListStyle}>
            {projects.map((project) => (
              <div key={project.id} style={projectBlockStyle}>
                <ProjectCard
                  project={project}
                  onClick={() => onProjectClick(project)}
                />

                {showActions && (
                  <div style={actionsRowStyle}>
                    {onRenameProject && (
                      <button
                        type="button"
                        style={actionButtonStyle}
                        onClick={() => onRenameProject(project)}
                      >
                        Переименовать
                      </button>
                    )}

                    {onDeleteProject && (
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        onClick={() => onDeleteProject(project)}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <section style={emptyStateStyle}>
            <div style={emptyIconStyle}>📁</div>
            <h2 style={emptyTitleStyle}>Пока нет проектов</h2>
            <p style={emptyTextStyle}>Создай первую сетку и она появится здесь.</p>
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
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
};

const projectBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const actionButtonStyle: React.CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 14,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
  color: "#ffffff",
  background: "rgba(27,29,34,0.72)",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(255,59,48,0.82)",
};

const emptyStateStyle: React.CSSProperties = {
  ...ui.glassCard,
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
  margin: 0,
  color: ds.color.textPrimary,
  fontSize: ds.font.sectionTitle,
  fontWeight: ds.weight.bold,
};

const emptyTextStyle: React.CSSProperties = {
  ...ui.bodyText,
  margin: "10px 0 0",
  maxWidth: 320,
};

export default ProjectsScreen;
