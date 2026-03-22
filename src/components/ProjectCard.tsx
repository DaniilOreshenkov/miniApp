import React from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import type { ProjectItem } from "../models/project";

interface Props {
  project: ProjectItem;
  onClick: () => void;
}

const ProjectCard: React.FC<Props> = ({ project, onClick }) => {
  return (
    <button style={projectCardStyle} onClick={onClick} type="button">
      <div style={projectIconStyle}>✦</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={projectTitleStyle}>{project.title}</div>
        <div style={projectSubtitleStyle}>{project.subtitle}</div>
      </div>

      <div style={projectDateStyle}>{project.updatedAt}</div>
    </button>
  );
};

const projectCardStyle: React.CSSProperties = {
  ...ui.card,
  width: "100%",
  padding: 16,
  borderRadius: ds.radius.xxxl,
  display: "flex",
  alignItems: "center",
  gap: 14,
  cursor: "pointer",
  textAlign: "left",
};

const projectIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: ds.radius.lg,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  border: `1px solid ${ds.color.border}`,
  color: ds.color.textPrimary,
  fontSize: 20,
  flexShrink: 0,
};

const projectTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleSm,
  fontWeight: ds.weight.semibold,
  marginBottom: 4,
};

const projectSubtitleStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: ds.font.bodySm,
};

const projectDateStyle: React.CSSProperties = {
  color: ds.color.textQuaternary,
  fontSize: ds.font.caption,
  flexShrink: 0,
};

export default ProjectCard;