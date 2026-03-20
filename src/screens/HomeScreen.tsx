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
  { id: "1", title: "Новый проект", subtitle: "9×10 • 2 мм", updatedAt: "Сегодня" },
  { id: "2", title: "Брелок сердце", subtitle: "12×14 • 2 мм", updatedAt: "Сегодня" },
  { id: "3", title: "Цветок", subtitle: "10×12 • 2 мм", updatedAt: "Сегодня" },
  { id: "4", title: "Клубника", subtitle: "14×16 • 2 мм", updatedAt: "Вчера" },
  { id: "5", title: "Смайлик", subtitle: "8×8 • 2 мм", updatedAt: "Вчера" },
  { id: "6", title: "Мишка", subtitle: "16×18 • 2 мм", updatedAt: "2 дня назад" },
  { id: "7", title: "Котик", subtitle: "13×15 • 2 мм", updatedAt: "2 дня назад" },
  { id: "8", title: "Звезда", subtitle: "11×11 • 2 мм", updatedAt: "3 дня назад" },
  { id: "9", title: "Молния", subtitle: "10×13 • 2 мм", updatedAt: "3 дня назад" },
  { id: "10", title: "Череп", subtitle: "15×17 • 2 мм", updatedAt: "Неделю назад" },
];

const HomeScreen: React.FC<Props> = ({ onCreateGrid }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");

  const hasProjects = mockProjects.length > 0;
  const latestProjects = mockProjects.slice(0, 10);

  const renderProjectCard = (project: ProjectItem) => (
    <button
      key={project.id}
      style={projectCardStyle}
      onClick={onCreateGrid}
      type="button"
    >
      <div style={projectIconStyle}>✦</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={projectTitleStyle}>{project.title}</div>
        <div style={projectSubtitleStyle}>{project.subtitle}</div>
      </div>

      <div style={projectDateStyle}>{project.updatedAt}</div>
    </button>
  );

  const homeContent = (
    <>
      <section style={stickyHeroWrapStyle}>
        <div style={heroTextSectionStyle}>
          <div style={appTitleStyle}>Beadly</div>
          <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>

          <button
            onClick={onCreateGrid}
            style={primaryButtonStyle}
            type="button"
          >
            + Создать сетку
          </button>
        </div>
      </section>

      {hasProjects && (
        <section style={sectionStyle}>
          <div style={sectionHeaderRowStyle}>
            <h2 style={sectionTitleStyle}>Последние проекты</h2>

            <button
              style={ghostButtonStyle}
              onClick={() => setActiveTab("projects")}
              type="button"
            >
              Все
            </button>
          </div>

          <div style={projectsListStyle}>
            {latestProjects.map(renderProjectCard)}
          </div>
        </section>
      )}
    </>
  );

  const templatesContent = (
    <section style={emptyStateStyle}>
      <div style={emptyIconStyle}>◻︎</div>
      <h2 style={emptyTitleStyle}>Шаблоны</h2>
      <p style={emptyTextStyle}>
        Тут позже будут готовые шаблоны для быстрого старта.
      </p>
    </section>
  );

  const projectsContent = (
    <section style={projectsSectionStyle}>
      <div style={sectionHeaderRowStyle}>
        <h2 style={sectionTitleStyle}>Проекты</h2>
      </div>

      {hasProjects ? (
        <div style={projectsListStyle}>{mockProjects.map(renderProjectCard)}</div>
      ) : (
        <section style={emptyStateStyle}>
          <div style={emptyIconStyle}>📁</div>
          <h2 style={emptyTitleStyle}>Пока нет проектов</h2>
          <p style={emptyTextStyle}>
            Создай первую сетку и она появится здесь.
          </p>
        </section>
      )}
    </section>
  );

  const content = useMemo(() => {
    if (activeTab === "home") return homeContent;
    if (activeTab === "templates") return templatesContent;
    return projectsContent;
  }, [activeTab]);

  return (
    <div style={pageStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div style={contentWrapperStyle}>
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
      type="button"
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
  height: "100vh",
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
  height: "100%",
  margin: "0 auto",
  padding: "0 18px 120px",
  boxSizing: "border-box",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 22,
  paddingTop: 18,
};

const stickyHeroWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 15,
  paddingTop: 4,
  paddingBottom: 18,
  background:
    "linear-gradient(180deg, rgba(12,14,18,0.96) 0%, rgba(12,14,18,0.88) 72%, rgba(12,14,18,0) 100%)",
  backdropFilter: "blur(18px)",
};

const heroTextSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 0,
};

const appTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  color: "#fff",
  letterSpacing: "-0.04em",
  marginBottom: 8,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.82)",
  fontSize: 20,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: "-0.03em",
  maxWidth: 520,
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: 18,
  width: "100%",
  minHeight: 78,
  padding: "18px 22px",
  borderRadius: 26,
  border: "1px solid rgba(255,255,255,0.14)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 100%)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 21,
  cursor: "pointer",
  boxShadow: "0 16px 34px rgba(0,0,0,0.26)",
  textAlign: "center",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const projectsSectionStyle: React.CSSProperties = {
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
  boxShadow: "none",
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
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
  background: "rgba(28, 30, 36, 0.9)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(24px)",
  boxShadow: "0 -10px 30px rgba(0,0,0,0.24)",
  pointerEvents: "auto",
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
  boxShadow: "none",
};

export default HomeScreen;