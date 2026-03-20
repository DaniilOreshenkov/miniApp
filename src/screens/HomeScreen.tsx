import React, { useMemo, useState } from "react";

interface Props {
  onCreateGrid: () => void;
}

type HomeTab = "home" | "templates" | "projects";

type ProjectItem = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
};

const mockProjects: ProjectItem[] = [
  {
    id: "1",
    title: "Новый проект",
    subtitle: "9×10 • 2 мм",
    updatedAt: "Сегодня",
  },
  {
    id: "2",
    title: "Брелок сердце",
    subtitle: "12×14 • 2 мм",
    updatedAt: "Вчера",
  },
];

const HomeScreen: React.FC<Props> = ({ onCreateGrid }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");

  const content = useMemo(() => {
    if (activeTab === "home") {
      return (
        <>
          <section style={heroCardStyle}>
            <div style={heroBadgeStyle}>Bead Pattern</div>

            <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>

            <p style={heroTextStyle}>
              Редактор сеток для бусин с удобным управлением, проектами и
              шаблонами.
            </p>

            <button onClick={onCreateGrid} style={primaryButtonStyle}>
              + Создать сетку
            </button>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderRowStyle}>
              <div>
                <div style={sectionEyebrowStyle}>Проекты</div>
                <h2 style={sectionTitleStyle}>Последние проекты</h2>
              </div>

              <button style={ghostButtonStyle}>Все</button>
            </div>

            <div style={projectsListStyle}>
              {mockProjects.map((project) => (
                <button
                  key={project.id}
                  style={projectCardStyle}
                  onClick={onCreateGrid}
                >
                  <div style={projectIconStyle}>✦</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={projectTitleStyle}>{project.title}</div>
                    <div style={projectSubtitleStyle}>{project.subtitle}</div>
                  </div>

                  <div style={projectDateStyle}>{project.updatedAt}</div>
                </button>
              ))}
            </div>
          </section>
        </>
      );
    }

    if (activeTab === "templates") {
      return (
        <section style={emptyStateStyle}>
          <div style={emptyIconStyle}>◻︎</div>
          <h2 style={emptyTitleStyle}>Шаблоны</h2>
          <p style={emptyTextStyle}>
            Тут позже будут готовые шаблоны для быстрого старта.
          </p>
        </section>
      );
    }

    return (
      <section style={emptyStateStyle}>
        <div style={emptyIconStyle}>📁</div>
        <h2 style={emptyTitleStyle}>Проекты</h2>
        <p style={emptyTextStyle}>
          Здесь будет полный список сохранённых проектов.
        </p>
      </section>
    );
  }, [activeTab, onCreateGrid]);

  return (
    <div style={pageStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div style={contentWrapperStyle}>
        <header style={headerStyle}>
          <div>
            <div style={appLabelStyle}>Mini App</div>
            <div style={appTitleStyle}>Beadly</div>
          </div>

          <div style={avatarStyle}>B</div>
        </header>

        <main style={mainStyle}>{content}</main>
      </div>

      <div style={tabbarWrapStyle}>
        <div style={tabbarStyle}>
          <TabBarButton
            active={activeTab === "home"}
            icon="🏠"
            label="Главная"
            onClick={() => setActiveTab("home")}
          />

          <TabBarButton
            active={activeTab === "templates"}
            icon="✦"
            label="Шаблоны"
            onClick={() => setActiveTab("templates")}
          />

          <TabBarButton
            active={activeTab === "projects"}
            icon="📁"
            label="Проекты"
            onClick={() => setActiveTab("projects")}
          />
        </div>
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
      style={{
        ...tabButtonStyle,
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        border: active
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid transparent",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span
        style={{
          fontSize: 11,
          color: active ? "#ffffff" : "rgba(255,255,255,0.64)",
          fontWeight: active ? 700 : 500,
        }}
      >
        {label}
      </span>
    </button>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  background:
    "radial-gradient(circle at top left, rgba(96,132,255,0.16), transparent 26%), radial-gradient(circle at top right, rgba(129,92,255,0.12), transparent 24%), linear-gradient(180deg, #121318 0%, #0c0e12 100%)",
  position: "relative",
  overflow: "hidden",
};

const topGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -100,
  left: -90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(65, 125, 255, 0.16)",
  filter: "blur(90px)",
  zIndex: 0,
};

const sideGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: 60,
  right: -90,
  width: 280,
  height: 280,
  borderRadius: "50%",
  background: "rgba(167, 94, 255, 0.14)",
  filter: "blur(90px)",
  zIndex: 0,
};

const contentWrapperStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  maxWidth: 860,
  margin: "0 auto",
  padding: "18px 18px 120px",
  boxSizing: "border-box",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
};

const appLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.56)",
  marginBottom: 6,
};

const appTitleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: "#fff",
  letterSpacing: "-0.03em",
};

const avatarStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.1)",
  fontWeight: 800,
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const heroCardStyle: React.CSSProperties = {
  padding: 22,
  borderRadius: 28,
  background:
    "linear-gradient(180deg, rgba(34,36,43,0.86) 0%, rgba(24,26,31,0.92) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(24px)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.24)",
};

const heroBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 12,
  marginBottom: 16,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 30,
  lineHeight: 1.05,
  fontWeight: 800,
  letterSpacing: "-0.04em",
};

const heroTextStyle: React.CSSProperties = {
  margin: "12px 0 20px",
  color: "rgba(255,255,255,0.68)",
  fontSize: 15,
  lineHeight: 1.5,
  maxWidth: 520,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "15px 18px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.14)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const sectionHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const sectionEyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.5)",
  marginBottom: 4,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.03em",
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const projectCardStyle: React.CSSProperties = {
  width: "100%",
  padding: 16,
  borderRadius: 22,
  background: "rgba(28, 30, 36, 0.7)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
  display: "flex",
  alignItems: "center",
  gap: 14,
  cursor: "pointer",
  textAlign: "left",
};

const projectIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#fff",
  fontSize: 20,
  flexShrink: 0,
};

const projectTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 4,
};

const projectSubtitleStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
};

const projectDateStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: 12,
  flexShrink: 0,
};

const emptyStateStyle: React.CSSProperties = {
  minHeight: "56vh",
  borderRadius: 28,
  background: "rgba(28, 30, 36, 0.66)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
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
  color: "#fff",
  fontSize: 22,
  fontWeight: 800,
};

const emptyTextStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "rgba(255,255,255,0.62)",
  fontSize: 14,
  lineHeight: 1.5,
  maxWidth: 320,
};

const tabbarWrapStyle: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 20,
  padding: "0 14px calc(12px + env(safe-area-inset-bottom))",
};

const tabbarStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  padding: 10,
  borderRadius: 28,
  background: "rgba(28, 30, 36, 0.9)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(24px)",
  boxShadow: "0 -10px 30px rgba(0,0,0,0.24)",
};

const tabButtonStyle: React.CSSProperties = {
  minHeight: 62,
  borderRadius: 20,
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  cursor: "pointer",
};
export default HomeScreen;