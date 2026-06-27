/**
 * Корневой контейнер приложения.
 *
 * Зона ответственности:
 * - хранит глобальное состояние: текущий экран, проекты, активный проект, тему;
 * - подключает жизненный цикл Telegram/WebView;
 * - передаёт данные в экраны и принимает действия пользователя через callbacks;
 * - показывает единый кастомный AppAlert вместо системных prompt/confirm.
 */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import { haptic } from "../utils/haptics";
import HomeScreen from "../screens/HomeScreen";
// Тяжёлые экраны грузятся лениво — не блокируют первый рендер HomeScreen.
// GridScreen содержит CanvasGrid (136KB), грузить его сразу не нужно.
const GridScreen         = lazy(() => import("../screens/GridScreen"));
const ImportImageScreen  = lazy(() => import("../screens/ImportImageScreen"));
const CreateProjectScreen = lazy(() => import("../screens/CreateProjectScreen"));
import ScreenTransition from "../components/ScreenTransition";
import ScreenLoader from "../components/ScreenLoader";
import AppAlert from "../components/AppAlert";
import type { GridData, GridProject, GridSeed } from "../entities/project/types";
import {
  createProjectFromSeed,
  formatProjectUpdatedAt,
  loadProjects,
  saveProjects,
  upsertProject,
} from "../entities/project/storage";
import type { AppTheme } from "./theme";
import {
  applyAppTheme,
  getNextTheme,
  getStoredTheme,
  getThemeBackgroundColor,
  saveTheme,
} from "./theme";

import { initTelegramViewport, setTelegramAppColor } from "./telegramViewport";
import { initAppTouchLock } from "./touchLock";

type Screen = "home" | "grid" | "import" | "create";
type ProjectAlertState =
  | { type: "rename"; project: GridProject }
  | { type: "delete"; project: GridProject };

const PROJECTS_SAVE_DEBOUNCE_MS = 180;

const SESSION_SCREEN_KEY = "beadly-session-screen";
const SESSION_PROJECT_KEY = "beadly-session-project-id";


/** Восстанавливает экран + активный проект из sessionStorage. */
const restoreSession = (projects: GridProject[]): { screen: Screen; gridData: GridData } => {
  try {
    const savedScreen = sessionStorage.getItem(SESSION_SCREEN_KEY);
    if (savedScreen === "create") return { screen: "create", gridData: null };
    if (savedScreen === "grid") {
      const id = sessionStorage.getItem(SESSION_PROJECT_KEY);
      const project = id ? (projects.find((p) => p.id === id) ?? null) : null;
      // Если проект не нашёлся (например был удалён) — падаем на home
      if (project) return { screen: "grid", gridData: project };
    }
  } catch { /* ignore */ }
  return { screen: "home", gridData: null };
};

const App = () => {
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());

  // screen и gridData инициализируются вместе чтобы не было рассинхрона
  const sessionRef = useRef(restoreSession(loadProjects()));
  const [screen, setScreen] = useState<Screen>(() => sessionRef.current.screen);
  const [gridData, setGridData] = useState<GridData>(() => sessionRef.current.gridData);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [projectAlert, setProjectAlert] = useState<ProjectAlertState | null>(null);

  const isThemeSwitchingRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const projectsSaveTimeoutRef = useRef<number | null>(null);
  const latestProjectsRef = useRef<GridProject[]>(projects);
  const lastSavedProjectsJsonRef = useRef<string | null>(null);

  /**
   * Сохраняет проекты немедленно. Используем при закрытии страницы,
   * чтобы debounce не потерял последние изменения в Telegram WebView.
   */
  const flushProjectsSave = useCallback(() => {
    if (typeof window === "undefined") return;

    if (projectsSaveTimeoutRef.current !== null) {
      window.clearTimeout(projectsSaveTimeoutRef.current);
      projectsSaveTimeoutRef.current = null;
    }

    const nextProjectsJson = JSON.stringify(latestProjectsRef.current);

    if (lastSavedProjectsJsonRef.current === nextProjectsJson) return;

    saveProjects(latestProjectsRef.current);
    lastSavedProjectsJsonRef.current = nextProjectsJson;
  }, []);

  // Сохраняем активный экран и ID проекта в sessionStorage.
  // Это позволяет восстановить состояние после перезагрузки страницы Telegram WebView.
  useEffect(() => {
    try {
      if (screen === "grid" && gridData?.id) {
        sessionStorage.setItem(SESSION_SCREEN_KEY, "grid");
        sessionStorage.setItem(SESSION_PROJECT_KEY, gridData.id);
      } else if (screen === "create") {
        sessionStorage.setItem(SESSION_SCREEN_KEY, "create");
        sessionStorage.removeItem(SESSION_PROJECT_KEY);
      } else {
        sessionStorage.removeItem(SESSION_SCREEN_KEY);
        sessionStorage.removeItem(SESSION_PROJECT_KEY);
      }
    } catch { /* ignore */ }
  }, [screen, gridData?.id]);

  // Применяем тему до отрисовки кадра, чтобы переключение не мигало и не дергало интерфейс.
  // setTelegramAppColor красит системную область TG (выше contentSafeAreaInset.top)
  // в цвет нашего фона — область системных кнопок выглядит частью приложения.
  useLayoutEffect(() => {
    applyAppTheme(theme);
    saveTheme(theme);
    setTelegramAppColor(getThemeBackgroundColor(theme));
  }, [theme]);

  // При размонтировании снимаем lock переключения темы.
  useEffect(() => {
    return () => { isThemeSwitchingRef.current = false; };
  }, []);

  /**
   * Сохраняем проекты с коротким debounce. Это уменьшает лишние записи
   * в localStorage при серии быстрых действий: переименование, удаление,
   * автосохранение после редактора.
   */
  useEffect(() => {
    latestProjectsRef.current = projects;

    if (typeof window === "undefined") {
      saveProjects(projects);
      return;
    }

    const nextProjectsJson = JSON.stringify(projects);

    if (lastSavedProjectsJsonRef.current === nextProjectsJson) return;

    if (projectsSaveTimeoutRef.current !== null) {
      window.clearTimeout(projectsSaveTimeoutRef.current);
    }

    projectsSaveTimeoutRef.current = window.setTimeout(() => {
      saveProjects(latestProjectsRef.current);
      lastSavedProjectsJsonRef.current = JSON.stringify(latestProjectsRef.current);
      projectsSaveTimeoutRef.current = null;
    }, PROJECTS_SAVE_DEBOUNCE_MS);
  }, [projects]);

  // При закрытии/сворачивании приложения принудительно сохраняем актуальный список проектов.
  // При восстановлении — переприменяем цвета Telegram-области (иначе шапка/фон TG чернеет).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushProjectsSave();
      } else {
        // Telegram WebView может сбрасывать цвета системной области при сворачивании.
        setTelegramAppColor(getThemeBackgroundColor(theme));
      }
    };

    window.addEventListener("pagehide", flushProjectsSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushProjectsSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushProjectsSave();
    };
  }, [flushProjectsSave, theme]);

  // Фоновая предзагрузка тяжёлых чанков после первого рендера HomeScreen.
  // GridScreen содержит CanvasGrid (~136KB) — грузим его заранее,
  // чтобы переход был мгновенным когда пользователь откроет проект.
  useEffect(() => {
    const id = window.setTimeout(() => {
      import("../screens/GridScreen");
      import("../screens/CreateProjectScreen");
      import("../screens/ImportImageScreen");
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);


  // Для Telegram Mini App настраиваем viewport и жесты, чтобы интерфейс вел себя как нативный.
  useEffect(() => {
    const cleanupTelegramViewport = initTelegramViewport();
    const cleanupTouchLock = initAppTouchLock();

    return () => {
      cleanupTelegramViewport();
      cleanupTouchLock();
    };
  }, []);

  /** Создаёт проект из пользовательских/импортированных данных и сразу открывает редактор. */
  const handleCreateGrid = useCallback((seed: GridSeed) => {
    const project = createProjectFromSeed(seed);

    setProjects((prev) => upsertProject(prev, project));
    setGridData(project);
    setImportFile(null);
    haptic.success();
    setScreen("grid");
  }, []);

  /** Открывает экран создания нового проекта. */
  const handleOpenCreate = useCallback(() => {
    setScreen("create");
  }, []);

  /** Закрывает экран создания и возвращает на главный экран. */
  const handleCloseCreate = useCallback(() => {
    setScreen("home");
  }, []);

  /** Открывает экран импорта изображения с выбранным файлом. */
  const handleImportFile = useCallback((file: File) => {
    setImportFile(file);
    setScreen("import");
  }, []);

  /** Закрывает экран импорта и возвращает на главный экран. */
  const handleCloseImport = useCallback(() => {
    setImportFile(null);
    setScreen("home");
  }, []);

  /** Открывает существующий проект без изменения его данных. */
  const handleOpenProject = useCallback((project: GridProject) => {
    setGridData(project);
    setScreen("grid");
  }, []);

  /** Сохраняет изменения из редактора и поднимает проект в начало списка. */
  const handleSaveProject = useCallback((project: GridProject) => {
    const nextProject: GridProject = {
      ...project,
      updatedAt: formatProjectUpdatedAt(),
    };

    setProjects((prev) => upsertProject(prev, nextProject));
    setGridData(nextProject);
  }, []);

  /** Открывает кастомное окно переименования вместо системного prompt. */
  const handleRenameProject = useCallback((project: GridProject) => {
    setProjectAlert({ type: "rename", project });
  }, []);

  /** Открывает кастомное окно удаления вместо системного confirm. */
  const handleDeleteProject = useCallback((project: GridProject) => {
    setProjectAlert({ type: "delete", project });
  }, []);

  const handleProjectAlertCancel = useCallback(() => {
    setProjectAlert(null);
  }, []);

  const handleProjectAlertConfirm = useCallback(
    (value?: string) => {
      if (!projectAlert) return;

      if (projectAlert.type === "rename") {
        const nextName = value?.trim();
        if (!nextName) return;

        const updatedAt = formatProjectUpdatedAt();
        const projectId = projectAlert.project.id;

        setProjects((prev) =>
          prev.map((item) =>
            item.id === projectId
              ? {
                  ...item,
                  name: nextName,
                  updatedAt,
                }
              : item,
          ),
        );

        setGridData((prev) => {
          if (!prev || prev.id !== projectId) return prev;

          return {
            ...prev,
            name: nextName,
            updatedAt,
          };
        });

        setProjectAlert(null);
        return;
      }

      const projectId = projectAlert.project.id;

      setProjects((prev) => prev.filter((item) => item.id !== projectId));

      setGridData((prev) => {
        if (!prev || prev.id !== projectId) return prev;
        return null;
      });

      if (gridData?.id === projectId) {
        setScreen("home");
      }

      setProjectAlert(null);
    },
    [gridData?.id, projectAlert],
  );

  const handleThemeToggle = useCallback((originX: number, originY: number) => {
    if (isThemeSwitchingRef.current) return;
    isThemeSwitchingRef.current = true;

    const nextTheme = getNextTheme(theme);
    // PC = мышь с hover. На PC — вертикальный wipe, на мобильном — circular reveal.
    const isMouse = typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    // dark → light = wipe сверху вниз; light → dark = снизу вверх
    const isDown  = nextTheme === "light";

    // ── View Transitions API (Chrome 111+, Safari 18+) ───────────────────────
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      if (isMouse) {
        // PC: вертикальный wipe
        document.documentElement.classList.add(isDown ? "theme-vt-down" : "theme-vt-up");
      } else {
        // Мобильный: circular bloom reveal из точки нажатия
        document.documentElement.classList.add("theme-vt-circle");
        document.documentElement.style.setProperty("--vt-x", `${originX}px`);
        document.documentElement.style.setProperty("--vt-y", `${originY}px`);
      }

      // Форсируем синхронный reflow — браузер обязан пересчитать CSS с новым классом
      // ДО того, как startViewTransition сделает снапшот "старого" экрана.
      // Без этого первая анимация показывает дефолтный crossfade вместо custom-анимации
      // (класс добавлен, но CSS engine не успел его обработать при холодном старте).
      void document.documentElement.offsetWidth;

      const vt = (document as Document & {
        startViewTransition: (fn: () => void) => { finished: Promise<void> };
      }).startViewTransition(() => {
        flushSync(() => setTheme(nextTheme));
      });

      vt.finished.finally(() => {
        document.documentElement.classList.remove("theme-vt-circle", "theme-vt-down", "theme-vt-up");
        document.documentElement.style.removeProperty("--vt-x");
        document.documentElement.style.removeProperty("--vt-y");
        isThemeSwitchingRef.current = false;
      });
      return;
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    const overlay = overlayRef.current;
    const glow    = glowRef.current;
    const newBg   = nextTheme === "light" ? "#f7f7fb" : "#0b0e14";
    const EXPAND  = 480;
    const FADE    = 110;

    if (!overlay) {
      setTheme(nextTheme);
      isThemeSwitchingRef.current = false;
      return;
    }

    overlay.style.transition  = "none";
    overlay.style.background  = newBg;
    overlay.style.opacity     = "1";
    overlay.style.transform   = "translateZ(0)";
    overlay.style.willChange  = "clip-path, opacity";

    if (isMouse) {
      // PC fallback: вертикальный inset-wipe
      overlay.style.clipPath = isDown ? "inset(0% 0% 100% 0%)" : "inset(100% 0% 0% 0%)";

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          overlay.style.transition = `clip-path ${EXPAND}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          overlay.style.clipPath   = "inset(0% 0% 0% 0%)";

          window.setTimeout(() => {
            setTheme(nextTheme);
            overlay.style.transition = `opacity ${FADE}ms ease-out`;
            overlay.style.opacity    = "0";
            window.setTimeout(() => {
              overlay.style.cssText    = "";
              isThemeSwitchingRef.current = false;
            }, FADE + 20);
          }, EXPAND - 20);
        });
      });
    } else {
      // Мобильный fallback: glow-вспышка + circular reveal из точки нажатия
      if (glow) {
        const SIZE = 72;
        glow.style.cssText = [
          "position:fixed",
          `width:${SIZE}px`, `height:${SIZE}px`,
          "border-radius:50%",
          `left:${originX - SIZE / 2}px`, `top:${originY - SIZE / 2}px`,
          `background:radial-gradient(circle,${newBg} 0%,transparent 70%)`,
          "opacity:1", "transform:scale(1)", "transition:none",
          "pointer-events:none", "z-index:99999", "will-change:transform,opacity",
        ].join(";");
        window.requestAnimationFrame(() => {
          glow.style.transition = `opacity ${EXPAND}ms ease-out,transform ${EXPAND}ms cubic-bezier(0.22,1,0.36,1)`;
          glow.style.opacity    = "0";
          glow.style.transform  = "scale(4)";
        });
      }

      overlay.style.clipPath = `circle(24px at ${originX}px ${originY}px)`;

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          overlay.style.transition = `clip-path ${EXPAND}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          overlay.style.clipPath   = `circle(200vmax at ${originX}px ${originY}px)`;

          window.setTimeout(() => {
            setTheme(nextTheme);
            overlay.style.transition = `opacity ${FADE}ms ease-out`;
            overlay.style.opacity    = "0";
            window.setTimeout(() => {
              overlay.style.cssText = "";
              if (glow) glow.style.cssText = "";
              isThemeSwitchingRef.current = false;
            }, FADE + 20);
          }, EXPAND - 20);
        });
      });
    }
  }, [theme]);

  const handleBackToHome = useCallback(() => {
    setScreen("home");
  }, []);

  const isDeleteAlert = projectAlert?.type === "delete";

  // Мемоизируем screens чтобы ScreenTransition не получал новый объект на каждый рендер.
  // Без этого useEffect внутри ScreenTransition обновляет slots при любом изменении состояния
  // (например при сохранении проекта), что вызывает лишние ре-рендеры.
  const screens = useMemo(() => ({
    home: (
      <HomeScreen
        onCreateNew={handleOpenCreate}
        onCreateGrid={handleCreateGrid}
        onOpenProject={handleOpenProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onImportFile={handleImportFile}
        projects={projects}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
    ),
    create: (
      <Suspense fallback={<ScreenLoader />}>
        <CreateProjectScreen
          onClose={handleCloseCreate}
          onCreate={handleCreateGrid}
        />
      </Suspense>
    ),
    grid: (
      <Suspense fallback={<ScreenLoader />}>
        <GridScreen
          data={gridData}
          onSave={handleSaveProject}
          onBack={handleBackToHome}
        />
      </Suspense>
    ),
    import: (
      <Suspense fallback={<ScreenLoader />}>
        <ImportImageScreen
          file={importFile}
          theme={theme}
          onClose={handleCloseImport}
          onCreate={handleCreateGrid}
        />
      </Suspense>
    ),
  }), [
    handleOpenCreate, handleCreateGrid, handleOpenProject, handleRenameProject,
    handleDeleteProject, handleImportFile, projects, theme,
    handleThemeToggle, handleCloseCreate, gridData, handleSaveProject,
    handleBackToHome, handleCloseImport, importFile,
  ]);

  return (
    <div className="app-shell">

      {/* Crossfade оверлей для плавного переключения темы */}
      <div ref={overlayRef} style={themeCrossfadeStyle} aria-hidden="true" />
      {/* Glow-вспышка в точке нажатия (только fallback-путь) */}
      <div ref={glowRef} aria-hidden="true" />

      <ErrorBoundary>
        <ScreenTransition
          screenKey={screen}
          screens={screens}
        />
      </ErrorBoundary>

      <AppAlert
        open={Boolean(projectAlert)}
        theme={theme}
        variant={isDeleteAlert ? "danger" : "input"}
        title={isDeleteAlert ? "Удалить проект?" : "Переименование"}
        message={
          isDeleteAlert
            ? `Проект «${projectAlert?.project.name ?? ""}» будет удалён из списка.`
            : undefined
        }
        value={projectAlert?.type === "rename" ? projectAlert.project.name : ""}
        inputLabel={projectAlert?.type === "rename" ? "Новое имя проекта" : undefined}
        placeholder="Название проекта"
        confirmText={isDeleteAlert ? "Удалить" : "Сохранить"}
        cancelText="Отмена"
        onConfirm={handleProjectAlertConfirm}
        onCancel={handleProjectAlertCancel}
      />
    </div>
  );
};

const themeCrossfadeStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99998,
  pointerEvents: "none",
  opacity: 0,
  willChange: "clip-path",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
};

export default App;
