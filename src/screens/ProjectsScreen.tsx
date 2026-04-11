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
  const projectsCountLabel = `${projects.length} ${getProjectWord(projects.length)}`;

  return (
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={heroBadgeStyle}>Мои схемы</div>

        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={heroTitleStyle}>Проекты</h1>
          <p style={heroSubtitleStyle}>
            {hasProjects
              ? `Здесь собраны все сохранённые проекты — ${projectsCountLabel}.`
              : "Здесь будут все твои сохранённые проекты."}
          </p>
        </div>
      </section>

      <section style={projectsSectionStyle}>
        {hasProjects ? (
          <div style={projectsListStyle}>
            {projects.map((project) => (
              <div key={project.id} style={projectBlockStyle}>
                <div style={projectCardShellStyle}>
                  <ProjectCard
                    project={project}
                    onClick={() => onProjectClick(project)}
                  />
                </div>

                {showActions && (
                  <div style={actionsPanelStyle}>
                    <div style={actionsPanelLabelStyle}>Управление проектом</div>

                    <div style={actionsRowStyle}>
                      {onRenameProject && (
                        <button
                          type="button"
                          style={renameActionButtonStyle}
                          onClick={() => onRenameProject(project)}
                        >
                          <span style={actionIconStyle}>✏️</span>
                          <span>Переименовать</span>
                        </button>
                      )}

                      {onDeleteProject && (
                        <button
                          type="button"
                          style={deleteActionButtonStyle}
                          onClick={() => onDeleteProject(project)}
                        >
                          <span style={actionIconStyle}>🗑️</span>
                          <span>Удалить</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <section style={emptyStateStyle}>
            <div style={emptyIconWrapStyle}>
              <div style={emptyIconStyle}>📁</div>
            </div>
            <h2 style={emptyTitleStyle}>Пока нет проектов</h2>
            <p style={emptyTextStyle}>Создай первую сетку и она появится здесь.</p>
          </section>
        )}
      </section>
    </>
  );
};

const getProjectWord = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return "проект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "проекта";
  }

  return "проектов";
};

const secondaryHeroWrapStyle: React.CSSProperties = {
  paddingTop: 22,
  paddingBottom: 14,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const heroBadgeStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "7px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: ds.color.textSecondary,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.2,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const secondaryHeroTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  paddingLeft: 2,
};

const heroTitleStyle: React.CSSProperties = {
  ...ui.screenTitle,
  margin: 0,
};

const heroSubtitleStyle: React.CSSProperties = {
  ...ui.bodyText,
  margin: 0,
  maxWidth: 480,
  color: ds.color.textSecondary,
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
  gap: 14,
  paddingBottom: "calc(124px + env(safe-area-inset-bottom, 0px))",
};

const projectBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const projectCardShellStyle: React.CSSProperties = {
  borderRadius: 28,
  padding: 4,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 18px 34px rgba(0,0,0,0.18)",
};

const actionsPanelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  borderRadius: 22,
  background: "rgba(17,18,22,0.42)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const actionsPanelLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: ds.color.textSecondary,
  paddingLeft: 2,
};

const actionsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const baseActionButtonStyle: React.CSSProperties = {
  minHeight: 48,
  border: "none",
  borderRadius: 18,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
  transition: "transform 140ms ease, opacity 140ms ease",
};

const renameActionButtonStyle: React.CSSProperties = {
  ...baseActionButtonStyle,
  color: "#ffffff",
  background: "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.08) 100%)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const deleteActionButtonStyle: React.CSSProperties = {
  ...baseActionButtonStyle,
  color: "#ffffff",
  background: "linear-gradient(180deg, rgba(255,99,89,0.95) 0%, rgba(255,59,48,0.82) 100%)",
};

const actionIconStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1,
};

const emptyStateStyle: React.CSSProperties = {
  ...ui.glassCard,
  minHeight: "56vh",
  borderRadius: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: 24,
  textAlign: "center",
  gap: 10,
  paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
};

const emptyIconWrapStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 4,
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 30,
};

const emptyTitleStyle: React.CSSProperties = {
  margin: 0,
  color: ds.color.textPrimary,
  fontSize: ds.font.sectionTitle,
  fontWeight: ds.weight.bold,
};

const emptyTextStyle: React.CSSProperties = {
  ...ui.bodyText,
  margin: 0,
  maxWidth: 320,
};

export default ProjectsScreen;
