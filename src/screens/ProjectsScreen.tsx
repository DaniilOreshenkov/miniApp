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

const extractGridSize = (subtitle: string) => {
  const match = subtitle.match(/(\d+)\s*[×xXхХ]\s*(\d+)/);

  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return { width, height, cells: width * height };
};

const formatProjectMeta = (project: ProjectItem) => {
  const size = extractGridSize(project.subtitle);

  if (!size) {
    return project.subtitle;
  }

  return `${size.width}×${size.height} • ${size.cells} крестиков`;
};

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
      <section style={heroWrapStyle}>
        <div style={heroGlassStyle}>
          <div style={heroTopRowStyle}>
            <div>
              <div style={eyebrowStyle}>Коллекция</div>
              <h1 style={heroTitleStyle}>Проекты</h1>
            </div>

            <div style={countBadgeStyle}>{projects.length}</div>
          </div>

          <p style={heroTextStyle}>
            Все твои схемы в одном месте. Нажми на карточку, чтобы открыть проект.
          </p>
        </div>
      </section>

      <section style={projectsSectionStyle}>
        {hasProjects ? (
          <div style={projectsListStyle}>
            {projects.map((project, index) => (
              <article key={project.id} style={projectShellStyle}>
                <div style={projectMetaRowStyle}>
                  <div style={projectNumberStyle}>#{index + 1}</div>
                  <div style={projectMetaTextStyle}>{formatProjectMeta(project)}</div>
                </div>

                <div style={projectCardWrapStyle}>
                  <ProjectCard
                    project={project}
                    onClick={() => onProjectClick(project)}
                  />
                </div>

                {showActions && (
                  <div style={actionsWrapStyle}>
                    {onRenameProject && (
                      <button
                        type="button"
                        style={actionButtonStyle}
                        onClick={() => onRenameProject(project)}
                      >
                        ✏️ Переименовать
                      </button>
                    )}

                    {onDeleteProject && (
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        onClick={() => onDeleteProject(project)}
                      >
                        🗑 Удалить
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <section style={emptyStateStyle}>
            <div style={emptyOrbStyle}>📁</div>
            <h2 style={emptyTitleStyle}>Пока пусто</h2>
            <p style={emptyTextStyle}>
              Когда создашь первую сетку, она красиво появится здесь.
            </p>
          </section>
        )}
      </section>
    </>
  );
};

const heroWrapStyle: React.CSSProperties = {
  paddingTop: 18,
  paddingBottom: 8,
};

const heroGlassStyle: React.CSSProperties = {
  ...ui.glassCard,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 18,
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.16)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const heroTopRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const eyebrowStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const heroTitleStyle: React.CSSProperties = {
  ...ui.screenTitle,
  margin: 0,
};

const heroTextStyle: React.CSSProperties = {
  ...ui.bodyText,
  margin: 0,
  maxWidth: 420,
};

const countBadgeStyle: React.CSSProperties = {
  minWidth: 44,
  height: 44,
  borderRadius: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 14px",
  color: ds.color.textPrimary,
  fontSize: 18,
  fontWeight: 800,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
};

const projectsSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 4,
  paddingBottom: 28,
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
};

const projectShellStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  borderRadius: 24,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 16px 36px rgba(0,0,0,0.12)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

const projectMetaRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const projectNumberStyle: React.CSSProperties = {
  flexShrink: 0,
  minWidth: 34,
  height: 34,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: ds.color.textPrimary,
  fontSize: 13,
  fontWeight: 800,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const projectMetaTextStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const projectCardWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const actionsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
};

const actionButtonStyle: React.CSSProperties = {
  flex: 1,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: ds.color.textPrimary,
  background: "rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  cursor: "pointer",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const dangerButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  color: "#ffffff",
  background: "linear-gradient(180deg, rgba(255,94,94,0.9) 0%, rgba(255,59,48,0.78) 100%)",
  border: "1px solid rgba(255,120,120,0.35)",
  boxShadow: "0 12px 26px rgba(255,59,48,0.18)",
};

const emptyStateStyle: React.CSSProperties = {
  ...ui.glassCard,
  minHeight: "58vh",
  borderRadius: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: 28,
  textAlign: "center",
  gap: 10,
  background: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.14)",
};

const emptyOrbStyle: React.CSSProperties = {
  width: 74,
  height: 74,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 30,
  marginBottom: 4,
  background: "rgba(255,255,255,0.09)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.16)",
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
