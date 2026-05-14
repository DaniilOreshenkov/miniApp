import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import CreateProjectSheet from "../components/CreateProjectSheet";
import ImportImageSheet from "../components/ImportImageSheet";
import { mockProjects, type ProjectItem } from "../models/project";
import ProjectsScreen from "./ProjectsScreen";
import type { GridProject, GridSeed } from "../App";
import { tryImportProjectPng } from "../projectPng";

interface Props {
  onCreateGrid: (data: GridSeed) => void;
  onOpenProject: (project: GridProject) => void;
  onRenameProject: (project: GridProject) => void;
  onDeleteProject: (project: GridProject) => void;
  projects: GridProject[];
}

type HomeTab = "home" | "projects";

type TelegramWebApp = {
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
};

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

const getTelegramWebApp = (): TelegramWebApp | null => {
  if (typeof window === "undefined") return null;

  const maybeWindow = window as Window & {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  };

  return maybeWindow.Telegram?.WebApp ?? null;
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

const getRowCount = (height: number) => {
  return Math.max(1, height) * 2 + 1;
};

const getRowLength = (width: number, rowIndex: number) => {
  const safeWidth = Math.max(1, width);
  return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
};

const getRowStartIndex = (width: number, targetRowIndex: number) => {
  let startIndex = 0;

  for (let rowIndex = 0; rowIndex < targetRowIndex; rowIndex += 1) {
    startIndex += getRowLength(width, rowIndex);
  }

  return startIndex;
};

const isWhiteCell = (color: string) => {
  const normalized = color.trim().toLowerCase();
  return (
    normalized === "#fff" || normalized === "#ffffff" || normalized === "white"
  );
};

const ImportIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M14 5.3V16.4"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M9.5 12.1L14 16.6L18.5 12.1"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 20.2H21"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

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
  const [importImageSheetOpen, setImportImageSheetOpen] = useState(false);
  const [importImageFile, setImportImageFile] = useState<File | null>(null);
  const [topControlsSpace, setTopControlsSpace] = useState<number>(
    getHomeTopControlsSpace,
  );

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const homeTouchStartYRef = useRef(0);
  const homeScrollRegionRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const telegramWebApp = getTelegramWebApp();
    if (!telegramWebApp) return;

    if (activeTab === "home") {
      telegramWebApp.disableVerticalSwipes?.();
      return;
    }

    telegramWebApp.enableVerticalSwipes?.();
  }, [activeTab]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || activeTab !== "home") return;

    const findScrollRegion = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>('[data-home-scroll-region="true"]');
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      homeTouchStartYRef.current = touch.clientY;
      homeScrollRegionRef.current = findScrollRegion(event.target);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      const scrollRegion = homeScrollRegionRef.current;

      if (!scrollRegion) {
        event.preventDefault();
        return;
      }

      const deltaY = touch.clientY - homeTouchStartYRef.current;
      const { scrollTop, scrollHeight, clientHeight } = scrollRegion;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      const pullingDown = deltaY > 0;
      const pushingUp = deltaY < 0;

      if ((atTop && pullingDown) || (atBottom && pushingUp)) {
        event.preventDefault();
      }
    };

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, [activeTab]);

  const savedProjectItems = useMemo(() => {
    return projects.map(toProjectItem);
  }, [projects]);

  const savedProjectsById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
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

  const closeImportImageSheet = () => {
    setImportImageSheetOpen(false);
    setImportImageFile(null);
  };

  const handleCreateImportedImageGrid = (seed: GridSeed) => {
    closeImportImageSheet();
    onCreateGrid(seed);
  };

  const handleImportPng = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setIsImportingPng(true);
      const projectPng = await tryImportProjectPng(file);

      if (projectPng) {
        onCreateGrid(projectPng);
        return;
      }

      setImportImageFile(file);
      setImportImageSheetOpen(true);
    } catch {
      window.alert("Не удалось импортировать изображение");
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

  const renderProjectPreview = (project?: GridProject) => {
    if (!project || project.cells.length === 0) {
      return (
        <div style={projectPreviewPlaceholderStyle}>
          <span style={projectPreviewPlaceholderDotStyle} />
          <span style={projectPreviewPlaceholderDotStyle} />
          <span style={projectPreviewPlaceholderDotStyle} />
          <span style={projectPreviewPlaceholderDotStyle} />
        </div>
      );
    }

    const rowCount = getRowCount(project.height);
    const maxPreviewRows = 13;
    const maxPreviewColumns = 14;
    const rowStep = Math.max(1, Math.ceil(rowCount / maxPreviewRows));
    const dots: Array<{
      key: string;
      x: number;
      y: number;
      color: string;
      isWhite: boolean;
    }> = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += rowStep) {
      const rowLength = getRowLength(project.width, rowIndex);
      const rowStartIndex = getRowStartIndex(project.width, rowIndex);
      const columnStep = Math.max(1, Math.ceil(rowLength / maxPreviewColumns));

      for (let cellIndex = 0; cellIndex < rowLength; cellIndex += columnStep) {
        const color = project.cells[rowStartIndex + cellIndex] ?? "#ffffff";
        const x = 8 + (cellIndex / Math.max(1, rowLength - 1)) * 84;
        const y = 8 + (rowIndex / Math.max(1, rowCount - 1)) * 84;

        dots.push({
          key: `${rowIndex}-${cellIndex}`,
          x,
          y,
          color,
          isWhite: isWhiteCell(color),
        });
      }
    }

    return (
      <svg
        viewBox="0 0 100 100"
        style={projectPreviewSvgStyle}
        aria-hidden="true"
      >
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="22"
          fill="rgba(255,255,255,0.08)"
        />
        {dots.map((dot) => (
          <circle
            key={dot.key}
            cx={dot.x}
            cy={dot.y}
            r={3.2}
            fill={dot.color}
            opacity={dot.isWhite ? 0.38 : 1}
            stroke={dot.isWhite ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.18)"}
            strokeWidth={0.9}
          />
        ))}
      </svg>
    );
  };

  const renderProjectCell = (projectItem: ProjectItem) => {
    const savedProject = savedProjectsById.get(projectItem.id);

    return (
      <button
        key={projectItem.id}
        type="button"
        style={projectCellStyle}
        onClick={() => openLatestProject(projectItem)}
      >
        <div style={projectPreviewStyle}>
          {renderProjectPreview(savedProject)}
        </div>

        <div style={projectCellTextStyle}>
          <div style={projectCellTitleStyle}>{projectItem.title}</div>
          <div style={projectCellSubtitleStyle}>{projectItem.subtitle}</div>
        </div>

        <div style={projectCellMetaStyle}>
          <div style={projectCellDotsStyle}>•••</div>
          <div style={projectCellDateStyle}>{projectItem.updatedAt}</div>
        </div>
      </button>
    );
  };

  const homeContent = (
    <div style={homeContentLayoutStyle}>
      <section style={heroWrapStyle}>
        <div style={heroTextWrapStyle}>
          <div style={appTitleStyle}>Beadly</div>
          <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>
        </div>

        <div style={heroButtonsStackStyle}>
          <button
            onClick={openCreateSheet}
            style={createGridCellStyle}
            type="button"
          >
            <span style={actionIconPrimaryStyle}>+</span>
            <span style={actionTextWrapStyle}>
              <span style={actionTitlePrimaryStyle}>Создать сетку</span>
              <span style={actionSubtitlePrimaryStyle}>Новая пустая схема</span>
            </span>
            <span style={actionArrowPrimaryStyle}>›</span>
          </button>

          <button
            onClick={handleImportButtonClick}
            style={importGridCellStyle}
            type="button"
            disabled={isImportingPng}
          >
            <span style={actionIconSecondaryStyle}>
              <ImportIcon />
            </span>
            <span style={actionTextWrapStyle}>
              <span style={actionTitleSecondaryStyle}>Импорт PNG</span>
              <span style={actionSubtitleSecondaryStyle}>
                Загрузить изображение
              </span>
            </span>
            <span style={actionArrowSecondaryStyle}>›</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
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

          <div
            data-home-scroll-region="true"
            style={latestProjectsViewportStyle}
          >
            <div style={projectsListStyle}>
              {latestProjects.map((project) => renderProjectCell(project))}
            </div>
          </div>
        </section>
      )}
    </div>
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
    <div
      style={{
        ...rootStyle,
        touchAction: importImageSheetOpen
          ? "auto"
          : activeTab === "home"
            ? "none"
            : "pan-y",
      }}
    >
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div
        ref={scrollContainerRef}
        style={{
          ...scrollAreaStyle,
          overflowY: activeTab === "home" ? "hidden" : "auto",
          paddingBottom: activeTab === "home" ? 0 : TAB_BAR_SAFE_SPACE,
          touchAction: importImageSheetOpen
            ? "auto"
            : activeTab === "home"
              ? "none"
              : "pan-y",
        }}
        className="app-scroll"
      >
        <main
          style={{
            ...mainStyle,
            paddingTop: `calc(env(safe-area-inset-top, 0px) + ${topControlsSpace}px)`,
            height: activeTab === "home" ? "100%" : undefined,
            minHeight: 0,
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

      <ImportImageSheet
        open={importImageSheetOpen}
        file={importImageFile}
        onClose={closeImportImageSheet}
        onCreate={handleCreateImportedImageGrid}
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
  minHeight: 0,
};

const homeContentLayoutStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 22,
  minHeight: 0,
  height: "100%",
  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 112px)",
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

const createGridCellStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 86,
  padding: "16px 18px",
  borderRadius: ds.radius.hero,
  display: "grid",
  gridTemplateColumns: "56px 1fr 24px",
  alignItems: "center",
  gap: 14,
  textAlign: "left",
  backfaceVisibility: "hidden",
  transform: "translateZ(0)",
};

const importGridCellStyle: React.CSSProperties = {
  ...ui.glassCard,
  width: "100%",
  minHeight: 82,
  padding: "15px 18px",
  borderRadius: ds.radius.hero,
  display: "grid",
  gridTemplateColumns: "56px 1fr 24px",
  alignItems: "center",
  gap: 14,
  textAlign: "left",
  cursor: "pointer",
  border: `1px solid ${ds.color.border}`,
  color: ds.color.textPrimary,
  boxSizing: "border-box",
  backfaceVisibility: "hidden",
  transform: "translateZ(0)",
};

const actionIconPrimaryStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.94)",
  color: "#111111",
  fontSize: 34,
  fontWeight: ds.weight.semibold,
  lineHeight: 1,
};

const actionIconSecondaryStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.10)",
  color: ds.color.textPrimary,
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
};

const actionTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
};

const actionTitlePrimaryStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 20,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.08,
};

const actionSubtitlePrimaryStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.76)",
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
};

const actionTitleSecondaryStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: 19,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.08,
};

const actionSubtitleSecondaryStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
};

const actionArrowPrimaryStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.78)",
  fontSize: 42,
  fontWeight: 300,
  lineHeight: 1,
  justifySelf: "end",
};

const actionArrowSecondaryStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 42,
  fontWeight: 300,
  lineHeight: 1,
  justifySelf: "end",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  flex: 1,
  minHeight: 0,
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
  display: "flex",
  flexDirection: "column",
  gap: 12,
  flex: 1,
  minHeight: 0,
  maxHeight: "none",
  overflowY: "auto",
  overflowX: "hidden",
  padding: "0 2px 8px",
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

const projectCellStyle: React.CSSProperties = {
  ...ui.glassCard,
  width: "100%",
  minHeight: 82,
  padding: "10px 12px",
  borderRadius: 22,
  display: "grid",
  gridTemplateColumns: "64px 1fr auto",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  cursor: "pointer",
  color: ds.color.textPrimary,
  border: `1px solid ${ds.color.border}`,
  boxSizing: "border-box",
  transform: "translateZ(0)",
};

const projectPreviewStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: 18,
  overflow: "hidden",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const projectPreviewSvgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
};

const projectPreviewPlaceholderStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 6,
  padding: 12,
  boxSizing: "border-box",
};

const projectPreviewPlaceholderDotStyle: React.CSSProperties = {
  borderRadius: "50%",
  background: "rgba(255,255,255,0.36)",
};

const projectCellTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const projectCellTitleStyle: React.CSSProperties = {
  color: ds.color.textPrimary,
  fontSize: 17,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectCellSubtitleStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectCellMetaStyle: React.CSSProperties = {
  minWidth: 76,
  height: 58,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  alignItems: "flex-end",
  color: ds.color.textSecondary,
};

const projectCellDotsStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: 18,
  fontWeight: ds.weight.bold,
  lineHeight: 1,
  letterSpacing: 1.5,
};

const projectCellDateStyle: React.CSSProperties = {
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
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
