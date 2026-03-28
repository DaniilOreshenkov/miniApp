import React from "react";
import { ds } from "../design-system/tokens";

export type HomeTab = "home" | "templates" | "projects";

interface Props {
  activeTab: HomeTab;
  onChange: (tab: HomeTab) => void;
}

const TabBar: React.FC<Props> = ({ activeTab, onChange }) => {
  return (
    <div style={tabbarWrapStyle}>
      <div style={tabbarStyle}>
        <TabBarButton
          active={activeTab === "home"}
          icon="🏠"
          label="Главная"
          onClick={() => onChange("home")}
        />

        <TabBarButton
          active={activeTab === "templates"}
          icon="✦"
          label="Шаблоны"
          onClick={() => onChange("templates")}
        />

        <TabBarButton
          active={activeTab === "projects"}
          icon="📁"
          label="Проекты"
          onClick={() => onChange("projects")}
        />
      </div>
    </div>
  );
};

interface TabBarButtonProps {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}

const TabBarButton: React.FC<TabBarButtonProps> = ({
  active,
  icon,
  label,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        ...tabButtonStyle,
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        border: active
          ? `1px solid ${ds.color.borderStrong}`
          : "1px solid transparent",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span
        style={{
          fontSize: ds.font.tab,
          color: active ? ds.color.textPrimary : "rgba(255,255,255,0.64)",
          fontWeight: active ? ds.weight.semibold : ds.weight.medium,
        }}
      >
        {label}
      </span>
    </button>
  );
};

const tabbarWrapStyle: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  padding: "0 14px calc(12px + env(safe-area-inset-bottom))",
  pointerEvents: "none",
};

const tabbarStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  padding: 10,
  borderRadius: 28,
  background: ds.color.surfaceStrong,
  border: `1px solid ${ds.color.border}`,
  backdropFilter: ds.blur.tabbar,
  boxShadow: ds.shadow.tabbar,
  pointerEvents: "auto",

  // 🔥 ключевое
  touchAction: "manipulation",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const tabButtonStyle: React.CSSProperties = {
  minHeight: 62,
  borderRadius: ds.radius.xxl,
  color: ds.color.textPrimary,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  cursor: "pointer",
  boxShadow: "none",
};

export default TabBar;