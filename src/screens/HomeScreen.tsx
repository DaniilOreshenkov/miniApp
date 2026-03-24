import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCard from "../components/ProjectCard";
import TabBar, { type HomeTab } from "../components/TabBar";
import CreateProjectSheet from "../components/CreateProjectSheet";
import { mockProjects } from "../models/project";
import TemplatesScreen from "./TemplatesScreen";
import ProjectsScreen from "./ProjectsScreen";

interface Props {
  onCreateGrid: () => void;
}

const COLLAPSE_SCROLL = 72;
const SWIPE_THRESHOLD = 44;
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const TAB_BAR_SAFE_SPACE = 160;

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

  const [tabContentVisible, setTabContentVisible] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const heroSurfaceRef = useRef<HTMLDivElement | null>(null);
  const textWrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestScrollRef = useRef(0);
  const tabAnimationRafRef = useRef<number | null>(null);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const hasProjects = mockProjects.length > 0;
  const latestProjects = mockProjects.slice(0, 10);

  const isProjectNameValid = projectName.trim().length > 0;
  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isCreateDisabled =
    !isProjectNameValid || !isWidthValid || !isHeightValid;

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
    const heroSurface = heroSurfaceRef.current;
    const textWrap = textWrapRef.current;
    const button = buttonRef.current;
    const badge = badgeRef.current;

    if (!sticky || !heroSurface || !textWrap || !button || !badge) return;

    const progress = Math.min(Math.max(scrollTop / COLLAPSE_SCROLL, 0), 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const stickyPaddingTop = 16 - 4 * eased;
    const stickyPaddingBottom = 18 - 8 * eased;

    const surfacePaddingTop = 18 - 5 * eased;
    const surfacePaddingBottom = 18 - 6 * eased;
    const surfacePaddingHorizontal = 18 - 2 * eased;
    const surfaceRadius = 28 - 8 * eased;
    const surfaceBorderOpacity = 0.12 - 0.04 * eased;
    const surfaceBgOpacity = 0.78 - 0.12 * eased;
    const surfaceBlur = 18 - 4 * eased;

    const badgeOpacity = 1 - eased * 0.75;
    const badgeTranslateY = -8 * eased;

    const textOpacity = 1 - eased;
    const textTranslateY = -18 * eased;
    const textScale = 1 - 0.06 * eased;
    const textHeight = 150 - 150 * eased;
    const textMarginBottom = 18 - 18 * eased;

    const buttonHeight = 76 - 12 * eased;
    const buttonFontSize = 20 - 2 * eased;
    const buttonRadius = 24 - 5 * eased;
    const buttonShadowY = 16 - 6 * eased;
    const buttonShadowBlur = 34 - 10 * eased;
    const buttonShadowOpacity = 0.22 - 0.08 * eased;
    const buttonTranslateY = -2 * eased;

    sticky.style.paddingTop = `${stickyPaddingTop}px`;
    sticky.style.paddingBottom = `${stickyPaddingBottom}px`;

    heroSurface.style.paddingTop = `${surfacePaddingTop}px`;
    heroSurface.style.paddingBottom = `${surfacePaddingBottom}px`;
    heroSurface.style.paddingLeft = `${surfacePaddingHorizontal}px`;
    heroSurface.style.paddingRight = `${surfacePaddingHorizontal}px`;
    heroSurface.style.borderRadius = `${surfaceRadius}px`;
    heroSurface.style.backdropFilter = `blur(${surfaceBlur}px)`;
    heroSurface.style.background = `linear-gradient(135deg, rgba(255,255,255,${surfaceBgOpacity}) 0%, rgba(255,255,255,${
      surfaceBgOpacity * 0.3
    }) 100%)`;
    heroSurface.style.border = `1px solid rgba(255,255,255,${surfaceBorderOpacity})`;

    badge.style.opacity = `${badgeOpacity}`;
    badge.style.transform = `translateY(${badgeTranslateY}px)`;

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
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (tabAnimationRafRef.current !== null) {
        cancelAnimationFrame(tabAnimationRafRef.current);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setTabContentVisible(false);

    latestScrollRef.current = 0;
    container.scrollTo({
      top: 0,
      behavior: "auto",
    });

    if (activeTab === "home") {
      requestAnimationFrame(() => applyHeroAnimation(0));
    }

    tabAnimationRafRef.current = requestAnimationFrame(() => {
      tabAnimationRafRef.current = requestAnimationFrame(() => {
        setTabContentVisible(true);
      });
    });

    return () => {
      if (tabAnimationRafRef.current !== null) {
        cancelAnimationFrame(tabAnimationRafRef.current);
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

  const homeContent = (
    <>
      <section ref={stickyRef} style={stickyHeroWrapStyle}>
        <div ref={heroSurfaceRef} style={heroSurfaceStyle}>
          <div ref={badgeRef} style={heroBadgeStyle}>
            ✨ Beadly Studio
          </div>

          <div ref={textWrapRef} style={heroTextWrapStyle}>
            <div style={appTitleStyle}>Beadly</div>
            <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>
            <p style={heroSubtitleStyle}>
              Проектируй схемы удобно, быстро и без лишней возни.
            </p>
          </div>

          <button
            ref={buttonRef}
            onClick={openCreateSheet}
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
            {latestProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={onCreateGrid}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );

  const content = useMemo(() => {
    if (activeTab === "home") return homeContent;
    if (activeTab === "templates") return <TemplatesScreen />;

    return (
      <ProjectsScreen projects={mockProjects} onProjectClick={onCreateGrid} />
    );
  }, [activeTab, onCreateGrid]);

  return (
    <div style={rootStyle}>
      <div style={backgroundBaseStyle} />
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />
      <div style={bottomGlowStyle} />

      <div
        ref={scrollContainerRef}
        style={scrollAreaStyle}
        onScroll={handleScroll}
        className="app-scroll"
      >
        <main
          style={{
            ...mainStyle,
            opacity: tabContentVisible ? 1 : 0,
            transition: "opacity 140ms ease",
            willChange: "opacity",
          }}
        >
          {content}
        </main>
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        onTouchStart={handleTabbarTouchStart}
        onTouchMove={handleTabbarTouchMove}
        onTouchEnd={handleTabbarTouchEnd}
      />

      <CreateProjectSheet
        open={createSheetOpen}
        projectName={projectName}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        isProjectNameValid={isProjectNameValid}
        isWidthValid={isWidthValid}
        isHeightValid={isHeightValid}
        isCreateDisabled={isCreateDisabled}
        onClose={closeCreateSheet}
        onCreate={handleCreateGrid}
        onProjectNameChange={setProjectName}
        onGridWidthChange={(value) =>
          setGridWidth(sanitizeNumericInput(value))
        }
        onGridHeightChange={(value) =>
          setGridHeight(sanitizeNumericInput(value))
        }
        onGridWidthBlur={() =>
          setGridWidth((prev) => clampGridValueOnBlur(prev))
        }
        onGridHeightBlur={() =>
          setGridHeight((prev) => clampGridValueOnBlur(prev))
        }
      />
    </div>
  );
};

const rootStyle: React.CSSProperties = {
  ...ui.page,
  position: "relative",
  width: "100%",
  height: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  minHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  maxHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  overflow: "hidden",
};

const backgroundBaseStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  background:
    "linear-gradient(180deg, rgba(11,18,40,0.96) 0%, rgba(7,12,28,0.98) 34%, rgba(4,7,18,1) 100%)",
};

const scrollAreaStyle: React.CSSProperties = {
  ...ui.contentWrapper,
  position: "relative",
  zIndex: 2,
  height: "100%",
  background: "transparent",
  paddingTop: "max(16px, env(safe-area-inset-top))",
  paddingBottom: TAB_BAR_SAFE_SPACE,
  boxSizing: "border-box",
  overflowY: "auto",
  overflowX: "hidden",
};

const topGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -100,
  left: -90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: ds.color.glowBlue,
  filter: "blur(95px)",
  zIndex: 0,
  pointerEvents: "none",
};

const sideGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: 40,
  right: -90,
  width: 300,
  height: 300,
  borderRadius: "50%",
  background: ds.color.glowPurple,
  filter: "blur(95px)",
  zIndex: 0,
  pointerEvents: "none",
};

const bottomGlowStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 120,
  left: "50%",
  transform: "translateX(-50%)",
  width: 360,
  height: 220,
  borderRadius: "50%",
  background: "rgba(58, 99, 255, 0.12)",
  filter: "blur(100px)",
  zIndex: 0,
  pointerEvents: "none",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 24,
  paddingBottom: 8,
};

const stickyHeroWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  background: "transparent",
  paddingTop: 16,
  paddingBottom: 18,
  willChange: "padding",
};

const heroSurfaceStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  padding: "18px",
  borderRadius: 28,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.22) 100%)",
  border: "1px solid rgba(255,255,255,0.12)",
  backdropFilter: "blur(18px)",
  boxShadow:
    "0 10px 40px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
};

const heroBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 34,
  padding: "8px 12px",
  marginBottom: 14,
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: "rgba(255,255,255,0.92)",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  willChange: "transform, opacity",
};

const heroTextWrapStyle: React.CSSProperties = {
  overflow: "hidden",
  transformOrigin: "top left",
  willChange: "transform, opacity, max-height, margin",
  maxHeight: 150,
  marginBottom: 18,
};

const appTitleStyle: React.CSSProperties = {
  fontSize: 64,
  lineHeight: 0.94,
  fontWeight: ds.weight.heavy,
  color: ds.color.textPrimary,
  letterSpacing: "-0.055em",
  marginBottom: 10,
  textShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.96)",
  fontSize: 22,
  lineHeight: 1.14,
  fontWeight: ds.weight.semibold,
  letterSpacing: "-0.03em",
  maxWidth: 520,
};

const heroSubtitleStyle: React.CSSProperties = {
  margin: "10px 0 0 0",
  color: "rgba(255,255,255,0.62)",
  fontSize: 15,
  lineHeight: 1.4,
  fontWeight: 500,
  maxWidth: 420,
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

export default HomeScreen;