import React from "react";

export type HomeTab = "home" | "projects" | "templates";

interface Props {
  activeTab: HomeTab;
  onChange: (tab: HomeTab) => void;
}

type VisibleTab = Exclude<HomeTab, "templates">;

const tabs: Array<{
  key: VisibleTab;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    key: "home",
    label: "Главная",
    icon: <HomeIcon />,
  },
  {
    key: "projects",
    label: "Проекты",
    icon: <ProjectsIcon />,
  },
];

const TabBar: React.FC<Props> = ({ activeTab, onChange }) => {
  return (
    <div style={shellStyle}>
      <div style={ambientGlowStyle} />

      <div style={barStyle}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              style={{
                ...tabButtonStyle,
                ...(isActive ? tabButtonActiveStyle : tabButtonIdleStyle),
              }}
            >
              <span
                style={{
                  ...iconWrapStyle,
                  ...(isActive ? iconWrapActiveStyle : iconWrapIdleStyle),
                }}
              >
                {tab.icon}
              </span>

              <span
                style={{
                  ...labelStyle,
                  opacity: isActive ? 1 : 0.72,
                }}
              >
                {tab.label}
              </span>

              <span
                style={{
                  ...activeLineStyle,
                  opacity: isActive ? 1 : 0,
                  transform: `scaleX(${isActive ? 1 : 0.6})`,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const HomeIcon: React.FC = () => {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.8L12 4L20 10.8V19C20 19.55 19.55 20 19 20H14.8C14.25 20 13.8 19.55 13.8 19V15.1C13.8 14.55 13.35 14.1 12.8 14.1H11.2C10.65 14.1 10.2 14.55 10.2 15.1V19C10.2 19.55 9.75 20 9.2 20H5C4.45 20 4 19.55 4 19V10.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const ProjectsIcon: React.FC = () => {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7.5C4 6.67 4.67 6 5.5 6H10L11.3 7.4C11.58 7.7 11.98 7.88 12.4 7.88H18.5C19.33 7.88 20 8.55 20 9.38V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12H16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
};

const shellStyle: React.CSSProperties = {
  position: "fixed",
  left: 12,
  right: 12,
  bottom: 0,
  zIndex: 60,
  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
  pointerEvents: "none",
  display: "flex",
  justifyContent: "center",
};

const ambientGlowStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 10,
  transform: "translateX(-50%)",
  width: "min(540px, calc(100vw - 40px))",
  height: 72,
  borderRadius: 999,
  background:
    "radial-gradient(circle at center, rgba(123, 97, 255, 0.20) 0%, rgba(123, 97, 255, 0.08) 45%, rgba(123, 97, 255, 0) 78%)",
  filter: "blur(22px)",
  pointerEvents: "none",
};

const barStyle: React.CSSProperties = {
  width: "min(560px, calc(100vw - 24px))",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  padding: 8,
  borderRadius: 28,
  background: "rgba(17, 19, 25, 0.74)",
  border: "1px solid rgba(255, 255, 255, 0.09)",
  boxShadow:
    "0 18px 50px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(24px) saturate(160%)",
  WebkitBackdropFilter: "blur(24px) saturate(160%)",
  pointerEvents: "auto",
};

const tabButtonStyle: React.CSSProperties = {
  position: "relative",
  border: "none",
  borderRadius: 22,
  minHeight: 62,
  padding: "10px 12px 14px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  cursor: "pointer",
  transition:
    "transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
  color: "#ffffff",
  overflow: "hidden",
  WebkitTapHighlightColor: "transparent",
};

const tabButtonActiveStyle: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.09) 100%)",
  boxShadow:
    "0 10px 24px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255,255,255,0.10)",
};

const tabButtonIdleStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.035)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const iconWrapStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 160ms ease, transform 160ms ease, opacity 160ms ease",
};

const iconWrapActiveStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.11)",
  transform: "translateY(-1px)",
};

const iconWrapIdleStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  lineHeight: 1,
  transition: "opacity 160ms ease",
};

const activeLineStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 7,
  width: 28,
  height: 3,
  borderRadius: 999,
  background: "rgba(255,255,255,0.95)",
  transition: "opacity 160ms ease, transform 160ms ease",
  boxShadow: "0 0 16px rgba(255,255,255,0.28)",
};

export default TabBar;
