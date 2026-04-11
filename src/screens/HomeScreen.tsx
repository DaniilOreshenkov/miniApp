import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCard from "../components/ProjectCard";
import CreateProjectSheet from "../components/CreateProjectSheet";
import { mockProjects, type ProjectItem } from "../models/project";
import ProjectsScreen from "./ProjectsScreen";
import type { GridProject, GridSeed } from "../App";
import { importImageToGridSeed } from "../projectPng";

interface Props {
  onCreateGrid: (data: GridSeed) => void;
  onOpenProject: (project: GridProject) => void;
  onRenameProject: (project: GridProject) => void;
  onDeleteProject: (project: GridProject) => void;
  projects: GridProject[];
}

type HomeTab = "home" | "projects";

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const TAB_BAR_SAFE_SPACE = 160;
const DEFAULT_HOME_TOP_CONTROLS_SPACE = 86;
const TELEGRAM_MOBILE_TOP_CONTROLS_SPACE = 118;
const TELEGRAM_DESKTOP_TOP_CONTROLS_SPACE = 88;
const MOBILE_WEB_TOP_CONTROLS_SPACE = 76;
const DESKTOP_WEB_TOP_CONTROLS_SPACE = 24;

const hasTelegramWebApp = () => {
  if (typeof window === "undefined") return false;

  const maybeWindow = window as Window & {
    Telegram?: {
      WebApp?: unknown;
    };
  };

  return Boolean(maybeWindow.Telegram?.WebApp);
};

const isTouchDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
};

const getHomeTopControlsSpace = () => {
  if (typeof window === "undefined") {
    return DEFAULT_HOME_TOP_CONTROLS_SPACE;
  }

  const hasTelegram = hasTelegramWebApp();
  const touch = isTouchDevice();

  if (hasTelegram && touch) return TELEGRAM_MOBILE_TOP_CONTROLS_SPACE;
  if (hasTelegram) return TELEGRAM_DESKTOP_TOP_CONTROLS_SPACE;
  if (touch) return MOBILE_WEB_TOP_CONTROLS_SPACE;

  return DESKTOP_WEB_TOP_CONTROLS_SPACE;
};

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

const parseGridSizeFromSubtitle = (subtitle: string) => {
  const match = subtitle.match(/(\d+)\s*[×xXхХ]\s*(\d+)/);

  if (!match) {
    return { width: 10, height: 10 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
};

const getMockProjectSeed = (project: ProjectItem): GridSeed => {
  const { width, height } = parseGridSizeFromSubtitle(project.subtitle);

  return {
    name: project.title,
    width,
    height,
  };
};

const toProjectItem = (project: GridProject): ProjectItem => {
  return {
    id: project.id,
    title: project.name,
    subtitle: `${project.width}×${project.height} • схема`,
    updatedAt: project.updatedAt,
  };
};

const HomeScreen: React.FC<Props> = ({
  onCreateGrid,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  projects,
}) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth] = useState("");
  const [gridHeight, setGridHeight] = useState("");
  const [isImportingPng, setIsImportingPng] = useState(false);
  const [topControlsSpace, setTopControlsSpace] = useState<number>(
    getHomeTopControlsSpace,
  );

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const updateTopControlsSpace = () => {
      setTopControlsSpace(getHomeTopControlsSpace());
    };

    updateTopControlsSpace();

    window.addEventListener("resize", updateTopControlsSpace);
    window.visualViewport?.addEventListener("resize", updateTopControlsSpace);

    return () => {
      window.removeEventListener("resize", updateTopControlsSpace);
      window.visualViewport?.removeEventListener(
        "resize",
        updateTopControlsSpace,
      );
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [activeTab]);

  const savedProjectItems = useMemo(() => {
    return projects.map(toProjectItem);
  }, [projects]);

  const hasSavedProjects = savedProjectItems.length > 0;
  const latestProjects = hasSavedProjects
    ? savedProjectItems.slice(0, 10)
    : mockProjects.slice(0, 10);

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

    onCreateGrid({
      name: projectName.trim(),
      width: Number(gridWidth),
      height: Number(gridHeight),
    });

    setCreateSheetOpen(false);
  };

  const handleImportButtonClick = () => {
    if (isImportingPng) return;
    fileInputRef.current?.click();
  };

  const handleImportPng = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setIsImportingPng(true);
      const seed = await importImageToGridSeed(file);
      onCreateGrid(seed);
    } catch {
      window.alert("Не удалось импортировать PNG");
    } finally {
      setIsImportingPng(false);
    }
  };

  const openLatestProject = (projectItem: ProjectItem) => {
    if (hasSavedProjects) {
      const savedProject = projects.find(
        (project) => project.id === projectItem.id,
      );

      if (savedProject) {
        onOpenProject(savedProject);
      }
      return;
    }

    onCreateGrid(getMockProjectSeed(projectItem));
  };

  const renameProject = (projectItem: ProjectItem) => {
    const savedProject = projects.find(
      (project) => project.id === projectItem.id,
    );
    if (!savedProject) return;

    onRenameProject(savedProject);
  };

  const deleteProject = (projectItem: ProjectItem) => {
    const savedProject = projects.find(
      (project) => project.id === projectItem.id,
    );
    if (!savedProject) return;

    onDeleteProject(savedProject);
  };

  const renderBottomTabButton = (tab: HomeTab, label: string) => {
    const isActive = activeTab === tab;

    return (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        style={{
          ...bottomTabButtonStyle,
          ...(isActive
            ? bottomTabButtonActiveStyle
            : bottomTabButtonInactiveStyle),
        }}
      >
        {label}
      </button>
    );
  };

  const homeContent = (
    <>
      <section style={heroWrapStyle}>
        <div style={heroTextWrapStyle}>
          <div style={appTitleStyle}>Beadly</div>
          <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>
        </div>

        <div style={heroButtonsStackStyle}>
          <button
            onClick={openCreateSheet}
            style={primaryButtonStyle}
            type="button"
          >
            + Создать сетку
          </button>

          <button
            onClick={handleImportButtonClick}
            style={primaryButtonStyle}
            type="button"
            disabled={isImportingPng}
          >
            {isImportingPng ? "Импорт PNG..." : "Импорт PNG"}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          onChange={handleImportPng}
          style={{ display: "none" }}
        />
      </section>

      {latestProjects.length > 0 && (
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

          <div style={latestProjectsViewportStyle}>
            <div style={projectsListStyle}>
              {latestProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => openLatestProject(project)}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );

  const content =
    activeTab === "home" ? (
      homeContent
    ) : (
      <ProjectsScreen
        projects={hasSavedProjects ? savedProjectItems : mockProjects}
        onProjectClick={(project) => openLatestProject(project)}
        onRenameProject={hasSavedProjects ? renameProject : undefined}
        onDeleteProject={hasSavedProjects ? deleteProject : undefined}
      />
    );

  return (
    <div style={rootStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div ref={scrollContainerRef} style={scrollAreaStyle} className="app-scroll">
        <main
          style={{
            ...mainStyle,
            paddingTop: `calc(env(safe-area-inset-top, 0px) + ${topControlsSpace}px)`,
          }}
        >
          {content}
        </main>
      </div>

      <div style={bottomBarShellStyle}>
        <div style={bottomBarStyle}>
          {renderBottomTabButton("home", "Главная")}
          {renderBottomTabButton("projects", "Проекты")}
        </div>
      </div>

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
        onGridWidthChange={(value) => setGridWidth(sanitizeNumericInput(value))}
        onGridHeightChange={(value) => setGridHeight(sanitizeNumericInput(value))}
        onGridWidthBlur={() => setGridWidth((prev) => clampGridValueOnBlur(prev))}
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
  overscrollBehavior: "none",
  touchAction: "pan-y",
};

const scrollAreaStyle: React.CSSProperties = {
  ...ui.contentWrapper,
  position: "relative",
  zIndex: 2,
  height: "100%",
  background: "transparent",
  paddingTop: 0,
  paddingBottom: TAB_BAR_SAFE_SPACE,
  boxSizing: "border-box",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehaviorY: "none",
  overscrollBehaviorX: "none",
  WebkitOverflowScrolling: "touch",
  touchAction: "pan-y",
};

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
  paddingBottom: 8,
};

const heroWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
  paddingTop: 18,
  paddingBottom: 4,
};

const heroTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const heroButtonsStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const appTitleStyle: React.CSSProperties = {
  fontSize: ds.font.heroApp,
  fontWeight: ds.weight.heavy,
  color: ds.color.textPrimary,
  letterSpacing: "-0.04em",
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
  backfaceVisibility: "hidden",
  transform: "translateZ(0)",
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

const latestProjectsViewportStyle: React.CSSProperties = {
  ...ui.glassCard,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxHeight: "min(52vh, 460px)",
  overflowY: "auto",
  overflowX: "hidden",
  padding: 14,
  borderRadius: 24,
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
  transform: "translateZ(0)",
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
};

const bottomBarShellStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
  pointerEvents: "none",
  padding: "0 16px calc(env(safe-area-inset-bottom, 0px) + 14px)",
};

const bottomBarStyle: React.CSSProperties = {
  ...ui.glassCard,
  pointerEvents: "auto",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: 10,
  borderRadius: 26,
  backdropFilter: "blur(18px)",
};

const bottomTabButtonStyle: React.CSSProperties = {
  border: "none",
  minHeight: 52,
  borderRadius: 18,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.bold,
  cursor: "pointer",
  transition: "background 160ms ease, box-shadow 160ms ease, color 160ms ease",
};

const bottomTabButtonActiveStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  background: "rgba(255,255,255,0.16)",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.22)",
};

const bottomTabButtonInactiveStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  background: "rgba(255,255,255,0.06)",
};

export default HomeScreen;
