import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";

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
    updatedAt: "Сегодня",
  },
  {
    id: "3",
    title: "Цветок",
    subtitle: "10×12 • 2 мм",
    updatedAt: "Сегодня",
  },
  {
    id: "4",
    title: "Клубника",
    subtitle: "14×16 • 2 мм",
    updatedAt: "Вчера",
  },
  {
    id: "5",
    title: "Смайлик",
    subtitle: "8×8 • 2 мм",
    updatedAt: "Вчера",
  },
  {
    id: "6",
    title: "Мишка",
    subtitle: "16×18 • 2 мм",
    updatedAt: "2 дня назад",
  },
  {
    id: "7",
    title: "Котик",
    subtitle: "13×15 • 2 мм",
    updatedAt: "2 дня назад",
  },
  {
    id: "8",
    title: "Звезда",
    subtitle: "11×11 • 2 мм",
    updatedAt: "3 дня назад",
  },
  {
    id: "9",
    title: "Молния",
    subtitle: "10×13 • 2 мм",
    updatedAt: "3 дня назад",
  },
  {
    id: "10",
    title: "Череп",
    subtitle: "15×17 • 2 мм",
    updatedAt: "Неделю назад",
  },
];

const COLLAPSE_SCROLL = 72;
const SWIPE_THRESHOLD = 44;
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;

const tabOrder: HomeTab[] = ["home", "templates", "projects"];

const sanitizeNumericInput = (value: string) => value.replace(/\D/g, "");

const isGridValueValid = (value: string) => {
  if (value.trim() === "") return false;
  const numericValue = Number(value);
  return (
    Number.isInteger(numericValue) &&
    numericValue >= MIN_GRID_SIZE &&
    numericValue <= MAX_GRID_SIZE
  );
};

const clampGridValueOnBlur = (value: string) => {
  if (value.trim() === "") return "";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "";
  if (numericValue < MIN_GRID_SIZE) return String(MIN_GRID_SIZE);
  if (numericValue > MAX_GRID_SIZE) return String(MAX_GRID_SIZE);

  return String(numericValue);
};

const HomeScreen: React.FC<Props> = ({ onCreateGrid }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth] = useState("");
  const [gridHeight, setGridHeight] = useState("");

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const textWrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestScrollRef = useRef(0);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const hasProjects = mockProjects.length > 0;
  const latestProjects = mockProjects.slice(0, 10);

  const isProjectNameValid = projectName.trim().length > 0;
  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isCreateDisabled = !isProjectNameValid || !isWidthValid || !isHeightValid;

  const openCreateSheet = () => {
    setCreateSheetOpen(true);
  };

  const closeCreateSheet = () => {
    setCreateSheetOpen(false);
  };

  const handleCreateGrid = () => {
    if (isCreateDisabled) return;

    onCreateGrid();
    setCreateSheetOpen(false);
  };

  const applyHeroAnimation = (scrollTop: number) => {
    const sticky = stickyRef.current;
    const textWrap = textWrapRef.current;
    const button = buttonRef.current;

    if (!sticky || !textWrap || !button) return;

    const progress = Math.min(Math.max(scrollTop / COLLAPSE_SCROLL, 0), 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const paddingTop = 18 - 6 * eased;
    const paddingBottom = 20 - 8 * eased;

    const textOpacity = 1 - eased;
    const textTranslateY = -18 * eased;
    const textScale = 1 - 0.06 * eased;
    const textHeight = 132 - 132 * eased;
    const textMarginBottom = 18 - 18 * eased;

    const buttonHeight = 76 - 12 * eased;
    const buttonFontSize = 20 - 2 * eased;
    const buttonRadius = 24 - 4 * eased;
    const buttonShadowY = 16 - 6 * eased;
    const buttonShadowBlur = 34 - 10 * eased;
    const buttonShadowOpacity = 0.26 - 0.1 * eased;
    const buttonTranslateY = -2 * eased;

    sticky.style.paddingTop = `${paddingTop}px`;
    sticky.style.paddingBottom = `${paddingBottom}px`;

    textWrap.style.opacity = `${textOpacity}`;
    textWrap.style.transform = `translateY(${textTranslateY}px) scale(${textScale})`;
    textWrap.style.maxHeight = `${textHeight}px`;
    textWrap.style.marginBottom = `${textMarginBottom}px`;

    button.style.minHeight = `${buttonHeight}px`;
    button.style.fontSize = `${buttonFontSize}px`;
    button.style.borderRadius = `${buttonRadius}px`;
    button.style.transform = `translateY(${buttonTranslateY}px)`;
    button.style.boxShadow = `0 ${buttonShadowY}px ${buttonShadowBlur}px rgba(0,0,0,${buttonShadowOpacity})`;
  };

  useEffect(() => {
    if (activeTab === "home") {
      applyHeroAnimation(latestScrollRef.current);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [activeTab]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    latestScrollRef.current = event.currentTarget.scrollTop;

    if (activeTab !== "home") return;
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      applyHeroAnimation(latestScrollRef.current);
      rafRef.current = null;
    });
  };

  const switchTabByDirection = (direction: "left" | "right") => {
    const currentIndex = tabOrder.indexOf(activeTab);

    if (direction === "left") {
      const nextIndex = Math.min(currentIndex + 1, tabOrder.length - 1);
      setActiveTab(tabOrder[nextIndex]);
      return;
    }

    const prevIndex = Math.max(currentIndex - 1, 0);
    setActiveTab(tabOrder[prevIndex]);
  };

  const handleTabbarTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTabbarTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTabbarTouchEnd = () => {
    const start = touchStartRef.current;
    const end = touchCurrentRef.current;

    touchStartRef.current = null;
    touchCurrentRef.current = null;

    if (!start || !end) return;

    const diffX = end.x - start.x;
    const diffY = end.y - start.y;

    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    if (absX < SWIPE_THRESHOLD) return;
    if (absX <= absY) return;

    if (diffX < 0) {
      switchTabByDirection("left");
    } else {
      switchTabByDirection("right");
    }
  };

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
      <section ref={stickyRef} style={stickyHeroWrapStyle}>
        <div ref={textWrapRef} style={heroTextWrapStyle}>
          <div style={appTitleStyle}>Beadly</div>
          <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>
        </div>

        <button
          ref={buttonRef}
          onClick={openCreateSheet}
          style={primaryButtonStyle}
          type="button"
        >
          + Создать сетку
        </button>
      </section>

      {hasProjects && (
        <section style={sectionStyle}>
          <div style={sectionHeaderRowStyle}>
            <h2 style={ui.sectionTitle}>Последние проекты</h2>

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
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={ui.screenTitle}>Шаблоны</h1>
        </div>
      </section>

      <section style={templatesSectionStyle}>
        <div style={templatesCardStyle}>
          <div style={emptyIconStyle}>◻︎</div>
          <p style={emptyTextStyle}>
            Пока здесь будет одна ячейка с текстом, как ты и хотел. Позже сюда
            можно добавить реальные карточки шаблонов.
          </p>
        </div>
      </section>
    </>
  );

  const projectsContent = (
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={ui.screenTitle}>Проекты</h1>
        </div>
      </section>

      <section style={projectsSectionStyle}>
        {hasProjects ? (
          <div style={projectsListStyle}>{mockProjects.map(renderProjectCard)}</div>
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

  const content = useMemo(() => {
    if (activeTab === "home") return homeContent;
    if (activeTab === "templates") return templatesContent;
    return projectsContent;
  }, [activeTab]);

  const renderCreateSheet = () => {
    return (
      <>
        <div
          onClick={closeCreateSheet}
          style={{
            position: "fixed",
            inset: 0,
            background: createSheetOpen ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0)",
            pointerEvents: createSheetOpen ? "auto" : "none",
            transition: "background 0.24s ease",
            zIndex: 120,
          }}
        />

        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 130,
            transform: createSheetOpen ? "translateY(0)" : "translateY(105%)",
            transition: "transform 0.26s ease",
            padding: "0 10px max(10px, env(safe-area-inset-bottom))",
            pointerEvents: createSheetOpen ? "auto" : "none",
          }}
        >
          <div style={sheetContainerStyle}>
            <div style={sheetHandleWrapStyle}>
              <div style={sheetHandleStyle} />
            </div>

            <div style={sheetHeaderStyle}>
              <button
                onClick={closeCreateSheet}
                type="button"
                style={closeIconButtonStyle}
              >
                ✕
              </button>

              <div style={sheetHeaderTitleStyle}>Новый проект</div>

              <div />
            </div>

            <div style={sheetContentStyle}>
              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Имя проекта</div>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Введите имя проекта"
                  style={{
                    ...sheetInputStyle,
                    border: isProjectNameValid
                      ? `1px solid ${ds.color.border}`
                      : "1px solid rgba(255,255,255,0.14)",
                  }}
                />
              </div>

              <div style={sheetFieldsRowStyle}>
                <div style={sheetStackStyle}>
                  <div style={sheetLabelStyle}>Ширина</div>
                  <input
                    value={gridWidth}
                    onChange={(e) =>
                      setGridWidth(sanitizeNumericInput(e.target.value))
                    }
                    onBlur={() =>
                      setGridWidth((prev) => clampGridValueOnBlur(prev))
                    }
                    inputMode="numeric"
                    placeholder="1"
                    style={{
                      ...sheetInputStyle,
                      border:
                        gridWidth === "" || isWidthValid
                          ? `1px solid ${ds.color.border}`
                          : `1px solid ${ds.color.danger}`,
                    }}
                  />
                  <div style={sheetHintStyle}>от 1 до 100, по крестикам</div>
                </div>

                <div style={sheetStackStyle}>
                  <div style={sheetLabelStyle}>Длина</div>
                  <input
                    value={gridHeight}
                    onChange={(e) =>
                      setGridHeight(sanitizeNumericInput(e.target.value))
                    }
                    onBlur={() =>
                      setGridHeight((prev) => clampGridValueOnBlur(prev))
                    }
                    inputMode="numeric"
                    placeholder="1"
                    style={{
                      ...sheetInputStyle,
                      border:
                        gridHeight === "" || isHeightValid
                          ? `1px solid ${ds.color.border}`
                          : `1px solid ${ds.color.danger}`,
                    }}
                  />
                  <div style={sheetHintStyle}>от 1 до 100, по крестикам</div>
                </div>
              </div>

              <button
                onClick={handleCreateGrid}
                style={{
                  ...sheetCreateButtonStyle,
                  opacity: isCreateDisabled ? 0.5 : 1,
                  cursor: isCreateDisabled ? "not-allowed" : "pointer",
                }}
                type="button"
                disabled={isCreateDisabled}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={pageStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div
        ref={scrollContainerRef}
        style={ui.contentWrapper}
        onScroll={handleScroll}
      >
        <main style={mainStyle}>{content}</main>
      </div>

      <div style={tabbarWrapStyle}>
        <div
          style={tabbarStyle}
          onTouchStart={handleTabbarTouchStart}
          onTouchMove={handleTabbarTouchMove}
          onTouchEnd={handleTabbarTouchEnd}
        >
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

      {renderCreateSheet()}
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

const pageStyle: React.CSSProperties = ui.page;

const topGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -100,
  left: -90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: ds.color.glowBlue,
  filter: "blur(90px)",
  zIndex: 0,
  pointerEvents: "none",
};

const sideGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: 60,
  right: -90,
  width: 280,
  height: 280,
  borderRadius: "50%",
  background: ds.color.glowPurple,
  filter: "blur(90px)",
  zIndex: 0,
  pointerEvents: "none",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 22,
};

const stickyHeroWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  background: "transparent",
  paddingTop: 18,
  paddingBottom: 20,
  willChange: "padding",
};

const heroTextWrapStyle: React.CSSProperties = {
  overflow: "hidden",
  transformOrigin: "top left",
  willChange: "transform, opacity, max-height, margin",
  maxHeight: 132,
  marginBottom: 18,
};

const appTitleStyle: React.CSSProperties = {
  fontSize: ds.font.heroApp,
  fontWeight: ds.weight.heavy,
  color: ds.color.textPrimary,
  letterSpacing: "-0.04em",
  marginBottom: 8,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: ds.color.textSecondary,
  fontSize: ds.font.heroTitle,
  lineHeight: 1.2,
  fontWeight: ds.weight.semibold,
  letterSpacing: "-0.03em",
  maxWidth: 520,
};

const primaryButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 76,
  padding: "18px 22px",
  borderRadius: ds.radius.hero,
  fontSize: ds.font.buttonHero,
  textAlign: "center",
  willChange: "transform, border-radius, min-height, font-size, box-shadow",
  backfaceVisibility: "hidden",
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

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const templatesSectionStyle: React.CSSProperties = {
  paddingTop: 2,
};

const projectsSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 2,
};

const sectionHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const ghostButtonStyle: React.CSSProperties = {
  ...ui.secondaryButton,
  padding: "10px 14px",
  borderRadius: ds.radius.md,
  fontSize: ds.font.bodyMd,
  boxShadow: "none",
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
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

const templatesCardStyle: React.CSSProperties = {
  ...ui.glassCard,
  minHeight: "46vh",
  borderRadius: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: "28px 24px",
  textAlign: "center",
  marginTop: 6,
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
  touchAction: "pan-y",
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

const closeIconButtonStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 36,
  height: 36,
  borderRadius: ds.radius.sm,
  fontSize: 18,
  fontWeight: ds.weight.semibold,
  padding: 0,
};

const sheetContainerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  borderRadius: ds.radius.sheet,
  overflow: "hidden",
  background: "#1b1d22",
  border: `1px solid ${ds.color.border}`,
  boxShadow: ds.shadow.sheet,
  display: "flex",
  flexDirection: "column",
};

const sheetHandleWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  paddingTop: 10,
  paddingBottom: 4,
  flexShrink: 0,
};

const sheetHandleStyle: React.CSSProperties = {
  width: 44,
  height: 5,
  borderRadius: ds.radius.pill,
  background: "rgba(255,255,255,0.18)",
};

const sheetHeaderStyle: React.CSSProperties = {
  padding: "0 16px 12px",
  display: "grid",
  gridTemplateColumns: "40px 1fr 40px",
  alignItems: "center",
  flexShrink: 0,
};

const sheetHeaderTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  textAlign: "center",
};

const sheetContentStyle: React.CSSProperties = {
  padding: "0 16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const sheetStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sheetFieldsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const sheetLabelStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
};

const sheetHintStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.52)",
  fontSize: ds.font.caption,
  lineHeight: 1.2,
};

const sheetInputStyle: React.CSSProperties = {
  ...ui.input,
  padding: "14px 16px",
  borderRadius: ds.radius.xl,
  fontSize: 17,
};

const sheetCreateButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  marginTop: 4,
  boxShadow: ds.shadow.button,
};

export default HomeScreen;