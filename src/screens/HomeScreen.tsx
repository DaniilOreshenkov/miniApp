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
import AppAlert from "../components/AppAlert";
import type { ProjectItem } from "../models/project";
import ProjectCell from "../components/ProjectCell";
import ProjectsScreen from "./ProjectsScreen";
import type { AppTheme } from "../app/theme";
import type { GridProject, GridSeed } from "../entities/project/types";
import { tryImportProjectPng } from "../utils/projectPng";
import { THEME_TRANSITION, getThemeView } from "../utils/appTheme";

interface Props {
  onCreateNew: () => void;
  onCreateGrid: (data: GridSeed) => void;
  onOpenProject: (project: GridProject) => void;
  onRenameProject: (project: GridProject) => void;
  onDeleteProject: (project: GridProject) => void;
  onImportFile: (file: File) => void;
  projects: GridProject[];
  theme: AppTheme;
  onThemeToggle: (x: number, y: number) => void;
}

type HomeTab = "home" | "projects";

type TelegramWebAppEvent = "viewportChanged" | "safeAreaChanged" | "contentSafeAreaChanged";

type TelegramWebApp = {
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
  offEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
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

const TAB_BAR_SAFE_SPACE = "calc(var(--app-tg-content-safe-area-inset-bottom, 0px) + 112px)";
const HOME_TOP_SAFE_SPACE = "var(--app-safe-top, 0px)";

/** Возвращает строку относительного времени: "только что", "вчера", "3 дня назад" и т.д. */
const getRelativeDate = (updatedAt: string | undefined): string => {
  if (!updatedAt) return "";

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 2) return "только что";
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `${diffDays} дня назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/** Преобразует сохранённые данные проекта в лёгкую модель карточки для UI. */
const toProjectItem = (project: GridProject): ProjectItem => {
  const relDate = getRelativeDate(project.updatedAt);
  const subtitle = relDate
    ? `${project.width}×${project.height} · ${relDate}`
    : `${project.width}×${project.height}`;

  return {
    id: project.id,
    title: project.name,
    subtitle,
    updatedAt: project.updatedAt,
  };
};

const HomeTabIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path
      d="M3 9.5L11 3L19 9.5V19a1 1 0 0 1-1 1H14v-5h-4v5H4a1 1 0 0 1-1-1V9.5Z"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

const ProjectsTabIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
    <rect x="12" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
    <rect x="3" y="12" width="7" height="7" rx="2" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
    <rect x="12" y="12" width="7" height="7" rx="2" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
  </svg>
);

const EmptyProjectsIcon = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
    <rect x="8" y="14" width="40" height="32" rx="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
    <path d="M18 24h20M18 30h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.3" />
    <circle cx="42" cy="14" r="8" fill="var(--primary)" fillOpacity="0.15" stroke="var(--primary)" strokeWidth="1.5" />
    <path d="M42 11v3.5L44 16" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
  onCreateNew,
  onCreateGrid,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onImportFile,
  projects,
  theme,
  onThemeToggle,
}) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [isImportingPng, setIsImportingPng] = useState(false);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [homeAlert, setHomeAlert] = useState<{ title: string; message?: string } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const homeTouchStartYRef = useRef(0);
  const homeScrollRegionRef = useRef<HTMLElement | null>(null);

  const themeView = getThemeView(theme);

  // Производные значения упрощают JSX и не дают пересчитывать списки прямо в разметке.


  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [activeTab]);


  useEffect(() => {
    homeScrollRegionRef.current = null;

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

      const scrollRegion = homeScrollRegionRef.current ?? container;

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

  const handleImportButtonClick = useCallback(() => {
    if (isImportingPng) return;
    fileInputRef.current?.click();
  }, [isImportingPng]);

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

        // Открываем полноэкранный ImportImageScreen вместо sheet
        onImportFile(file);
      } catch {
        setHomeAlert({
          title: "Не удалось импортировать изображение",
          message: "Попробуй выбрать другой PNG/JPG/WEBP или сделать скриншот изображения.",
        });
      } finally {
        setIsImportingPng(false);
      }
    },
    [onCreateGrid, onImportFile], // eslint-disable-line react-hooks/exhaustive-deps
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
        <span style={tabIconStyle}>
          {tab === "home"
            ? <HomeTabIcon active={isActive} />
            : <ProjectsTabIcon active={isActive} />}
        </span>
        <span style={tabLabelStyle}>{label}</span>
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
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onThemeToggle(
                  Math.round(rect.left + rect.width / 2),
                  Math.round(rect.top + rect.height / 2),
                );
              }}
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
            onClick={onCreateNew}
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
              Все ({savedProjectItems.length})
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
            <div style={{ ...homeEmptyIconStyle, color: themeView.textSecondary }}>
              <EmptyProjectsIcon />
            </div>
            <div style={{ ...homeEmptyTitleStyle, color: themeView.textSecondary }}>
              Проектов пока нет
            </div>
            <div style={{ ...homeEmptySubtitleStyle, color: themeView.textSecondary }}>
              Нажми «Создать сетку», чтобы начать
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
      }}
    >
      <div style={{ ...topGlowStyle, background: themeView.glowBlue }} />
      <div style={{ ...sideGlowStyle, background: themeView.glowPurple }} />

      <div
        ref={scrollContainerRef}
        style={{
          ...scrollAreaStyle,
          overflowY: "hidden",
          paddingTop: 0,
          paddingBottom: 0,
          touchAction: "pan-y",
        }}
        className={activeTab === "home" ? "app-scroll home-scroll" : "app-scroll"}
      >
        <main
          style={{
            ...mainStyle,
            paddingTop: 0,
            height: "100%",
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

      <AppAlert
        open={Boolean(homeAlert)}
        theme={theme}
        variant="info"
        title={homeAlert?.title ?? "Ошибка"}
        message={homeAlert?.message}
        confirmText="Понятно"
        onConfirm={() => setHomeAlert(null)}
        onCancel={() => setHomeAlert(null)}
      />
    </div>
  );
};

const rootStyle: React.CSSProperties = {
  ...ui.page,
  transition: THEME_TRANSITION,
  position: "relative",
  width: "100%",
  height: "var(--app-height, 100dvh)",
  minHeight: "var(--app-height, 100dvh)",
  maxHeight: "var(--app-height, 100dvh)",
  overflow: "hidden",
  overscrollBehavior: "none",
};

const scrollAreaStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  maxWidth: 860,
  margin: "0 auto",
  height: "100%",
  background: "transparent",
  paddingLeft: 18,
  paddingRight: 18,
  paddingTop: 0,
  paddingBottom: 0,
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
  background: "transparent",
};

const homeContentLayoutStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 22,
  minHeight: 0,
  height: "100%",
  paddingTop: HOME_TOP_SAFE_SPACE,
  paddingBottom: TAB_BAR_SAFE_SPACE,
  boxSizing: "border-box",
};

const heroWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
  paddingTop: 0,
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
  // Немного опускаем блок «Последние проекты» ближе к нижнему toolbar.
  // Safe top/bottom не трогаем: это только визуальный промежуток внутри Home.
  marginTop: 10,
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
  background: "transparent",
  padding: "0 2px calc(var(--app-tg-content-safe-area-inset-bottom, 0px) + 8px)",
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
  flexDirection: "column",
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
  padding: "0 16px calc(var(--app-tg-content-safe-area-inset-bottom, 0px) + 14px)",
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
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
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

const tabIconStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
};

const tabLabelStyle: React.CSSProperties = {
  fontSize: ds.font.caption,
  fontWeight: ds.weight.bold,
  lineHeight: 1,
};

const homeEmptyIconStyle: React.CSSProperties = {
  opacity: 0.6,
  marginBottom: 12,
};

const homeEmptySubtitleStyle: React.CSSProperties = {
  transition: THEME_TRANSITION,
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.medium,
  lineHeight: 1.4,
  opacity: 0.6,
  marginTop: 6,
};

export default HomeScreen;