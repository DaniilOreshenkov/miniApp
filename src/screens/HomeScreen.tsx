/**
 * Главный экран.
 *
 * Зона ответственности:
 * - локальное UI-состояние sheet-окон, file input, активной вкладки и меню проектов;
 * - точки входа для создания проекта и импорта PNG;
 * - отображение последних проектов и передача действий наверх через callbacks.
 *
 * Бизнес-логику по возможности держим вне этого компонента.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import CreateProjectSheet from "../components/CreateProjectSheet";
import ImportImageSheet from "../components/ImportImageSheet";
import type { ProjectItem } from "../models/project";
import ProjectCell from "../components/ProjectCell";
import ProjectsScreen from "./ProjectsScreen";
import type { AppTheme } from "../app/theme";
import type { GridProject, GridSeed } from "../entities/project/types";
import { tryImportProjectPng } from "../utils/projectPng";
import { THEME_TRANSITION, getThemeView } from "../utils/appTheme";

interface Props {
  onCreateGrid: (data: GridSeed) => void;
  onOpenProject: (project: GridProject) => void;
  onRenameProject: (project: GridProject) => void;
  onDeleteProject: (project: GridProject) => void;
  projects: GridProject[];
  theme: AppTheme;
  onThemeToggle: () => void;
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
// Проверки layout для Telegram оставляем локально: они влияют только на главный экран.
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

// Поля размера сетки принимают только числа; лимиты валидации заданы выше.
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

/** Преобразует сохранённые данные проекта в лёгкую модель карточки для UI. */
const toProjectItem = (project: GridProject): ProjectItem => {
  return {
    id: project.id,
    title: project.name,
    subtitle: `${project.width}×${project.height} • схема`,
    updatedAt: project.updatedAt,
  };
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

const PlusIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M14 7V21"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    <path
      d="M7 14H21"
      stroke="currentColor"
      strokeWidth="2.6"
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
  theme,
  onThemeToggle,
}) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth] = useState("");
  const [gridHeight, setGridHeight] = useState("");
  const [isImportingPng, setIsImportingPng] = useState(false);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(
    null,
  );
  const [importImageSheetOpen, setImportImageSheetOpen] = useState(false);
  const [importImageFile, setImportImageFile] = useState<File | null>(null);
  const [topControlsSpace, setTopControlsSpace] = useState<number>(
    getHomeTopControlsSpace,
  );

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const homeTouchStartYRef = useRef(0);
  const homeScrollRegionRef = useRef<HTMLElement | null>(null);

  const themeView = getThemeView(theme);

  // Производные значения упрощают JSX и не дают пересчитывать списки прямо в разметке.

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

  useEffect(() => {
    if (!openProjectMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest('[data-project-menu-root="true"]')
      ) {
        return;
      }

      setOpenProjectMenuId(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openProjectMenuId]);

  const savedProjectItems = useMemo(() => {
    return projects.map(toProjectItem);
  }, [projects]);

  const savedProjectsById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  const latestProjects = useMemo(() => {
    return savedProjectItems.slice(0, 10);
  }, [savedProjectItems]);

  const hasSavedProjects = savedProjectItems.length > 0;

  const isProjectNameValid = projectName.trim().length > 0;
  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isCreateDisabled =
    !isProjectNameValid || !isWidthValid || !isHeightValid;

  const openCreateSheet = useCallback(() => {
    setCreateSheetOpen(true);
  }, []);

  const closeCreateSheet = useCallback(() => {
    setCreateSheetOpen(false);
  }, []);

  const handleCreateGrid = useCallback(() => {
    if (isCreateDisabled) return;

    onCreateGrid({
      name: projectName.trim(),
      width: Number(gridWidth),
      height: Number(gridHeight),
    });

    setCreateSheetOpen(false);
  }, [gridHeight, gridWidth, isCreateDisabled, onCreateGrid, projectName]);

  const handleImportButtonClick = useCallback(() => {
    if (isImportingPng) return;
    fileInputRef.current?.click();
  }, [isImportingPng]);

  const closeImportImageSheet = useCallback(() => {
    setImportImageSheetOpen(false);
    setImportImageFile(null);
  }, []);

  const handleCreateImportedImageGrid = useCallback((seed: GridSeed) => {
    closeImportImageSheet();
    onCreateGrid(seed);
  }, [closeImportImageSheet, onCreateGrid]);

  const handleImportPng = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [onCreateGrid],
  );

  const openLatestProject = useCallback((projectItem: ProjectItem) => {
    const savedProject = savedProjectsById.get(projectItem.id);

    if (savedProject) {
      onOpenProject(savedProject);
    }
  }, [onOpenProject, savedProjectsById]);

  const renameProject = useCallback((projectItem: ProjectItem) => {
    const savedProject = savedProjectsById.get(projectItem.id);
    if (!savedProject) return;

    onRenameProject(savedProject);
  }, [onRenameProject, savedProjectsById]);

  const deleteProject = useCallback((projectItem: ProjectItem) => {
    const savedProject = savedProjectsById.get(projectItem.id);
    if (!savedProject) return;

    onDeleteProject(savedProject);
  }, [onDeleteProject, savedProjectsById]);

  const toggleProjectMenu = useCallback((projectItem: ProjectItem) => {
    setOpenProjectMenuId((currentId) =>
      currentId === projectItem.id ? null : projectItem.id,
    );
  }, []);

  const renameProjectFromMenu = useCallback((projectItem: ProjectItem) => {
    setOpenProjectMenuId(null);
    renameProject(projectItem);
  }, [renameProject]);

  const deleteProjectFromMenu = useCallback((projectItem: ProjectItem) => {
    setOpenProjectMenuId(null);
    deleteProject(projectItem);
  }, [deleteProject]);

  const openProjectsTab = useCallback(() => {
    setActiveTab("projects");
  }, []);

  const openHomeTab = useCallback(() => {
    setActiveTab("home");
  }, []);

  const renderBottomTabButton = (tab: HomeTab, label: string) => {
    const isActive = activeTab === tab;

    return (
      <button
        key={tab}
        type="button"
        onClick={tab === "home" ? openHomeTab : openProjectsTab}
        style={{
          ...bottomTabButtonStyle,
          ...(isActive
            ? {
                ...bottomTabButtonActiveStyle,
                background: themeView.bottomActive,
                color: themeView.textPrimary,
                boxShadow: themeView.isLight
                  ? "0 8px 18px rgba(119,86,223,0.10)"
                  : bottomTabButtonActiveStyle.boxShadow,
              }
            : {
                ...bottomTabButtonInactiveStyle,
                background: themeView.bottomInactive,
                color: themeView.textSecondary,
              }),
        }}
      >
        {label}
      </button>
    );
  };

  const homeContent = (
    <div style={homeContentLayoutStyle}>
      <section style={heroWrapStyle}>
        <div style={heroTextWrapStyle}>
          <div style={heroTitleRowStyle}>
            <div style={{ ...appTitleStyle, color: themeView.textPrimary }}>
              Beadly
            </div>

            <button
              type="button"
              onClick={onThemeToggle}
              aria-label={
                theme === "light"
                  ? "Включить тёмную тему"
                  : "Включить светлую тему"
              }
              title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
              style={{
                ...themeSwitchStyle,
                background: themeView.isLight
                  ? "rgba(28,28,30,0.05)"
                  : "rgba(255,255,255,0.08)",
                border: `1px solid ${themeView.border}`,
              }}
            >
              <span
                style={{
                  ...themeSwitchThumbStyle,
                  transform:
                    theme === "light"
                      ? "translate3d(24px, 0, 0)"
                      : "translate3d(0, 0, 0)",
                  background: theme === "light" ? "#ffffff" : "#262831",
                  color: theme === "light" ? "var(--primary)" : "#ffffff",
                  boxShadow: themeView.isLight
                    ? "0 6px 14px rgba(28,28,30,0.16)"
                    : "0 6px 14px rgba(0,0,0,0.34)",
                }}
              >
                {theme === "light" ? "☀" : "☾"}
              </span>
            </button>
          </div>

          <h1 style={{ ...heroTitleStyle, color: themeView.textSecondary }}>
            Создавай схемы быстро и красиво
          </h1>
        </div>

        <div style={heroButtonsStackStyle}>
          <button
            onClick={openCreateSheet}
            style={createGridCellStyle}
            type="button"
          >
            <span style={actionIconPrimaryStyle}>
              <PlusIcon />
            </span>
            <span style={actionTextWrapStyle}>
              <span style={actionTitlePrimaryStyle}>Создать сетку</span>
              <span style={actionSubtitlePrimaryStyle}>Новая пустая схема</span>
            </span>
            <span style={actionArrowPrimaryStyle}>›</span>
          </button>

          <button
            onClick={handleImportButtonClick}
            style={{
              ...importGridCellStyle,
              background: themeView.cardStrong,
              border: `1px solid ${themeView.border}`,
              color: themeView.textPrimary,
              boxShadow: themeView.shadow,
            }}
            type="button"
            disabled={isImportingPng}
          >
            <span
              style={{
                ...actionIconSecondaryStyle,
                background: themeView.previewBg,
                color: themeView.textPrimary,
                boxShadow: `inset 0 0 0 1px ${themeView.previewBorder}`,
              }}
            >
              <ImportIcon />
            </span>
            <span style={actionTextWrapStyle}>
              <span
                style={{
                  ...actionTitleSecondaryStyle,
                  color: themeView.textPrimary,
                }}
              >
                Импорт PNG
              </span>
              <span
                style={{
                  ...actionSubtitleSecondaryStyle,
                  color: themeView.textSecondary,
                }}
              >
                Загрузить изображение
              </span>
            </span>
            <span
              style={{
                ...actionArrowSecondaryStyle,
                color: themeView.textSecondary,
              }}
            >
              ›
            </span>
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

      <section style={sectionStyle}>
        <div style={sectionHeaderRowStyle}>
          <h2 style={{ ...ui.sectionTitle, color: themeView.textPrimary }}>
            Последние проекты
          </h2>

          {hasSavedProjects ? (
            <button
              style={{
                ...ghostButtonStyle,
                color:
                  theme === "light" ? "var(--primary)" : ds.color.textPrimary,
                background: themeView.isLight
                  ? "rgba(119,86,223,0.10)"
                  : ghostButtonStyle.background,
              }}
              onClick={openProjectsTab}
              type="button"
            >
              Все
            </button>
          ) : null}
        </div>

        {hasSavedProjects ? (
          <div
            data-home-scroll-region="true"
            style={latestProjectsViewportStyle}
          >
            <div style={projectsListStyle}>
              {latestProjects.map((project) => (
                <ProjectCell
                  key={project.id}
                  projectItem={project}
                  project={savedProjectsById.get(project.id)}
                  theme={theme}
                  showActions
                  isMenuOpen={openProjectMenuId === project.id}
                  onClick={openLatestProject}
                  onMenuToggle={toggleProjectMenu}
                  onRenameProject={renameProjectFromMenu}
                  onDeleteProject={deleteProjectFromMenu}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            data-home-scroll-region="true"
            style={homeEmptyProjectsStyle}
          >
            <div style={{ ...homeEmptyTitleStyle, color: themeView.textSecondary }}>
              Здесь появятся ваши последние проекты
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const content =
    activeTab === "home" ? (
      homeContent
    ) : (
      <ProjectsScreen
        projects={savedProjectItems}
        savedProjects={projects}
        theme={theme}
        onProjectClick={openLatestProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
      />
    );

  return (
    <div
      style={{
        ...rootStyle,
        background: themeView.background,
        color: themeView.textPrimary,
        touchAction: importImageSheetOpen
          ? "auto"
          : activeTab === "home"
            ? "none"
            : "pan-y",
      }}
    >
      <div style={{ ...topGlowStyle, background: themeView.glowBlue }} />
      <div style={{ ...sideGlowStyle, background: themeView.glowPurple }} />

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
        <div
          style={{
            ...bottomBarStyle,
            background: themeView.cardStrong,
            border: `1px solid ${themeView.border}`,
            boxShadow: themeView.shadow,
          }}
        >
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
  transition: THEME_TRANSITION,
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
  transition: THEME_TRANSITION,
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
  transition: THEME_TRANSITION,
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

const heroTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const themeSwitchStyle: React.CSSProperties = {
  width: 58,
  height: 34,
  borderRadius: 999,
  padding: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  cursor: "pointer",
  flexShrink: 0,
  transition: THEME_TRANSITION,
};

const themeSwitchThumbStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  fontWeight: ds.weight.heavy,
  lineHeight: 1,
  transition:
    "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), background 260ms ease, color 260ms ease, box-shadow 260ms ease",
  willChange: "transform",
};

const heroButtonsStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const appTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.heroApp,
  fontWeight: ds.weight.heavy,
  color: ds.color.textPrimary,
  letterSpacing: "-0.04em",
};

const heroTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
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
  transition: `${THEME_TRANSITION}, transform 180ms ease`,
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
  transition: `${THEME_TRANSITION}, transform 180ms ease`,
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
  transition: THEME_TRANSITION,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: ds.color.primaryButtonIconBg,
  color: ds.color.primary,
  fontSize: 34,
  fontWeight: ds.weight.semibold,
  lineHeight: 1,
};

const actionIconSecondaryStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  transition: THEME_TRANSITION,
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
  transition: THEME_TRANSITION,
  color: "#ffffff",
  fontSize: 20,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.08,
};

const actionSubtitlePrimaryStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: "rgba(255,255,255,0.76)",
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
};

const actionTitleSecondaryStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: ds.color.textPrimary,
  fontSize: 19,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.08,
};

const actionSubtitleSecondaryStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
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
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
};

const homeEmptyProjectsStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  flex: 1,
  minHeight: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px",
  textAlign: "center",
};

const homeEmptyTitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.2,
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
  transition: THEME_TRANSITION,
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
