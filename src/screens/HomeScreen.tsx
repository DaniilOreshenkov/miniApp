import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import CreateProjectSheet from "../components/CreateProjectSheet";
import ImportImageSheet from "../components/ImportImageSheet";
import { mockProjects, type ProjectItem } from "../models/project";
import ProjectsScreen from "./ProjectsScreen";
import type { AppTheme, GridProject, GridSeed } from "../App";
import { tryImportProjectPng } from "../projectPng";

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
const THEME_TRANSITION =
  "background 260ms ease, background-color 260ms ease, color 260ms ease, border-color 260ms ease, box-shadow 260ms ease, opacity 260ms ease, filter 260ms ease";

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

const getThemeView = (theme: AppTheme) => {
  const isLight = theme === "light";

  return {
    isLight,
    background: "var(--bg)",
    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    card: "var(--surface)",
    cardStrong: "var(--surface-strong)",
    border: "var(--border)",
    previewBg: isLight ? "rgba(28,28,30,0.04)" : "rgba(255,255,255,0.06)",
    previewBorder: "var(--border)",
    bottomActive: "var(--tab-active-bg)",
    bottomInactive: "var(--tab-inactive-bg)",
    shadow: "var(--shadow-card)",
    glowBlue: "var(--glow-blue)",
    glowPurple: "var(--glow-purple)",
  };
};

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
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
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

      if (target instanceof Element && target.closest('[data-project-menu-root="true"]')) {
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
          fill={themeView.previewBg}
        />
        {dots.map((dot) => (
          <circle
            key={dot.key}
            cx={dot.x}
            cy={dot.y}
            r={3.2}
            fill={dot.color}
            opacity={dot.isWhite ? 0.38 : 1}
            stroke={
              dot.isWhite
                ? themeView.isLight
                  ? "rgba(28,28,30,0.16)"
                  : "rgba(255,255,255,0.28)"
                : "rgba(0,0,0,0.18)"
            }
            strokeWidth={0.9}
          />
        ))}
      </svg>
    );
  };

  const handleProjectCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    projectItem: ProjectItem,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openLatestProject(projectItem);
  };

  const renderProjectCell = (projectItem: ProjectItem) => {
    const savedProject = savedProjectsById.get(projectItem.id);
    const canShowProjectMenu = Boolean(savedProject && hasSavedProjects);
    const isMenuOpen = openProjectMenuId === projectItem.id;

    const handleMenuToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!canShowProjectMenu) return;

      setOpenProjectMenuId((currentId) =>
        currentId === projectItem.id ? null : projectItem.id,
      );
    };

    const handleRenameClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      setOpenProjectMenuId(null);
      renameProject(projectItem);
    };

    const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      setOpenProjectMenuId(null);
      deleteProject(projectItem);
    };

    return (
      <div
        key={projectItem.id}
        role="button"
        tabIndex={0}
        style={{
          ...projectCellStyle,
          zIndex: isMenuOpen ? 120 : 1,
          overflow: "visible",
          background: themeView.cardStrong,
          border: `1px solid ${themeView.border}`,
          color: themeView.textPrimary,
          boxShadow: themeView.shadow,
        }}
        onClick={() => openLatestProject(projectItem)}
        onKeyDown={(event) => handleProjectCellKeyDown(event, projectItem)}
      >
        <div
          style={{
            ...projectPreviewStyle,
            background: themeView.previewBg,
            border: `1px solid ${themeView.previewBorder}`,
          }}
        >
          {renderProjectPreview(savedProject)}
        </div>

        <div style={projectCellTextStyle}>
          <div
            style={{ ...projectCellTitleStyle, color: themeView.textPrimary }}
          >
            {projectItem.title}
          </div>
          <div
            style={{
              ...projectCellSubtitleStyle,
              color: themeView.textSecondary,
            }}
          >
            {projectItem.subtitle}
          </div>
        </div>

        <div
          data-project-menu-root="true"
          style={{ ...projectCellMetaStyle, color: themeView.textSecondary }}
        >
          <button
            type="button"
            onClick={handleMenuToggle}
            disabled={!canShowProjectMenu}
            aria-label="Открыть меню проекта"
            title="Меню"
            style={{
              ...projectCellDotsButtonStyle,
              color: themeView.textSecondary,
              background: isMenuOpen
                ? themeView.isLight
                  ? "rgba(119,86,223,0.12)"
                  : "rgba(255,255,255,0.10)"
                : "transparent",
              opacity: canShowProjectMenu ? 1 : 0.38,
            }}
          >
            <span style={projectCellDotsStyle}>•••</span>
          </button>

          <div
            style={{ ...projectCellDateStyle, color: themeView.textSecondary }}
          >
            {projectItem.updatedAt}
          </div>

          {canShowProjectMenu && isMenuOpen ? (
            <div
              style={{
                ...projectMenuStyle,
                background: themeView.cardStrong,
                border: `1px solid ${themeView.border}`,
                boxShadow: themeView.isLight
                  ? "0 18px 42px rgba(28,28,30,0.16)"
                  : "0 18px 42px rgba(0,0,0,0.38)",
              }}
            >
              <button
                type="button"
                onClick={handleRenameClick}
                style={{
                  ...projectMenuButtonStyle,
                  color: themeView.textPrimary,
                }}
              >
                Переименовать
              </button>

              <div
                style={{
                  ...projectMenuDividerStyle,
                  background: themeView.border,
                }}
              />

              <button
                type="button"
                onClick={handleDeleteClick}
                style={{
                  ...projectMenuButtonStyle,
                  color: "var(--danger)",
                }}
              >
                Удалить
              </button>
            </div>
          ) : null}
        </div>
      </div>
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

      {latestProjects.length > 0 && (
        <section style={sectionStyle}>
          <div style={sectionHeaderRowStyle}>
            <h2 style={{ ...ui.sectionTitle, color: themeView.textPrimary }}>
              Последние проекты
            </h2>

            <button
              style={{
                ...ghostButtonStyle,
                color: theme === "light" ? "var(--primary)" : ds.color.textPrimary,
                background: themeView.isLight
                  ? "rgba(119,86,223,0.10)"
                  : ghostButtonStyle.background,
              }}
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
        savedProjects={hasSavedProjects ? projects : []}
        theme={theme}
        onProjectClick={(project) => openLatestProject(project)}
        onRenameProject={hasSavedProjects ? renameProject : undefined}
        onDeleteProject={hasSavedProjects ? deleteProject : undefined}
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
  transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), background 260ms ease, color 260ms ease, box-shadow 260ms ease",
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
  color: ds.color.primaryButtonIconText,
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

const projectCellStyle: React.CSSProperties = {
  ...ui.glassCard,
  position: "relative",
  transition: `${THEME_TRANSITION}, transform 180ms ease`,
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
  WebkitUserSelect: "none",
  userSelect: "none",
};

const projectPreviewStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  transition: THEME_TRANSITION,
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
  transition: THEME_TRANSITION,
  color: ds.color.textPrimary,
  fontSize: 17,
  fontWeight: ds.weight.heavy,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectCellSubtitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: ds.color.textSecondary,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const projectCellMetaStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 3,
  transition: THEME_TRANSITION,
  minWidth: 76,
  height: 58,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  alignItems: "flex-end",
  color: ds.color.textSecondary,
};

const projectCellDotsButtonStyle: React.CSSProperties = {
  width: 36,
  height: 28,
  minHeight: 28,
  padding: 0,
  border: "none",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "none",
  cursor: "pointer",
  transition: THEME_TRANSITION,
  WebkitTapHighlightColor: "transparent",
};

const projectCellDotsStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: "currentColor",
  fontSize: 18,
  fontWeight: ds.weight.bold,
  lineHeight: 1,
  letterSpacing: 1.5,
  transform: "translateY(-2px)",
};

const projectCellDateStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  color: ds.color.textSecondary,
  fontSize: ds.font.caption,
  fontWeight: ds.weight.semibold,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
};

const projectMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: 32,
  right: 0,
  zIndex: 240,
  width: 176,
  padding: 6,
  borderRadius: 18,
  overflow: "hidden",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  transform: "translateZ(0)",
  pointerEvents: "auto",
};

const projectMenuButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "0 12px",
  border: "none",
  borderRadius: 12,
  background: "transparent",
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  textAlign: "left",
  fontSize: 14,
  fontWeight: ds.weight.bold,
  cursor: "pointer",
};

const projectMenuDividerStyle: React.CSSProperties = {
  width: "100%",
  height: 1,
  opacity: 0.72,
  margin: "3px 0",
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
