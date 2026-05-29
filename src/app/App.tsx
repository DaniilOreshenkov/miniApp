/**
 * Корневой контейнер приложения.
 *
 * Зона ответственности:
 * - хранит глобальное состояние: текущий экран, проекты, активный проект, тему;
 * - подключает жизненный цикл Telegram/WebView;
 * - передаёт данные в экраны и принимает действия пользователя через callbacks;
 * - показывает единый кастомный AppAlert вместо системных prompt/confirm.
 */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import HomeScreen from "../screens/HomeScreen";
// Тяжёлые экраны грузятся лениво — не блокируют первый рендер HomeScreen.
// GridScreen содержит CanvasGrid (136KB), грузить его сразу не нужно.
const GridScreen         = lazy(() => import("../screens/GridScreen"));
const ImportImageScreen  = lazy(() => import("../screens/ImportImageScreen"));
const CreateProjectScreen = lazy(() => import("../screens/CreateProjectScreen"));
import ScreenTransition from "../components/ScreenTransition";
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

const App = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [gridData, setGridData] = useState<GridData>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [projectAlert, setProjectAlert] = useState<ProjectAlertState | null>(null);

  const isThemeSwitchingRef = useRef(false);
  const themeProgressRef = useRef<HTMLDivElement | null>(null);
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

    // ── View Transition API — circular reveal ──────────────────────────────────
    // --vt-x / --vt-y задают центр разворачивающегося круга (точку нажатия кнопки).
    // CSS clip-path анимирует circle(0 → 200vmax) поверх старого снапшота.
    const docWithVT = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    if (typeof document !== "undefined" && docWithVT.startViewTransition) {
      const root = document.documentElement;
      root.style.setProperty("--vt-x", `${originX}px`);
      root.style.setProperty("--vt-y", `${originY}px`);

      // theme-switching глушит все CSS transitions на элементах.
      // Без этого VT снимает снапшот пока элементы ещё на полпути к новым цветам → мигание.
      root.classList.add("theme-switching");

      // Прогресс-бар: анимируем напрямую через DOM, чтобы не триггерить re-render.
      // view-transition-name исключает его из VT-снапшота — бар живёт поверх обоих слоёв.
      const bar = themeProgressRef.current;
      if (bar) {
        bar.style.transition = "none";
        bar.style.width = "0%";
        bar.style.opacity = "1";
        // Один rAF чтобы браузер применил width=0 перед стартом анимации
        window.requestAnimationFrame(() => {
          bar.style.transition = "width 480ms cubic-bezier(0.4, 0, 0.6, 1)";
          bar.style.width = "100%";
        });
      }

      docWithVT.startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
      }).finished.finally(() => {
        root.classList.remove("theme-switching");
        root.style.removeProperty("--vt-x");
        root.style.removeProperty("--vt-y");
        isThemeSwitchingRef.current = false;
        // Скрываем бар после окончания VT
        if (bar) {
          bar.style.transition = "opacity 180ms ease";
          bar.style.opacity = "0";
        }
      });
      return;
    }

    // ── Fallback: мгновенная смена для WebView без VT ──────────────────────────
    setTheme(nextTheme);
    isThemeSwitchingRef.current = false;
  }, [theme]);

  const handleBackToHome = useCallback(() => {
    setScreen("home");
  }, []);

  const isDeleteAlert = projectAlert?.type === "delete";

  return (
    <div className="app-shell">
      {/* Прогресс-бар переключения темы. view-transition-name выносит его из VT-снапшота
          — бар рендерится поверх обоих слоёв circular reveal независимо. */}
      <div ref={themeProgressRef} style={themeProgressStyle} aria-hidden="true" />

      <ScreenTransition
        screenKey={screen}
        screens={{
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
            <Suspense fallback={null}>
              <CreateProjectScreen
                onClose={handleCloseCreate}
                onCreate={handleCreateGrid}
              />
            </Suspense>
          ),
          grid: (
            <Suspense fallback={null}>
              <GridScreen
                data={gridData}
                onSave={handleSaveProject}
                onBack={handleBackToHome}
              />
            </Suspense>
          ),
          import: (
            <Suspense fallback={null}>
              <ImportImageScreen
                file={importFile}
                theme={theme}
                onClose={handleCloseImport}
                onCreate={handleCreateGrid}
              />
            </Suspense>
          ),
        }}
      />

      <AppAlert
        open={Boolean(projectAlert)}
        theme={theme}
        variant={isDeleteAlert ? "danger" : "input"}
        title={isDeleteAlert ? "Удалить проект?" : "Переименовать проект"}
        message={
          isDeleteAlert
            ? `Проект «${projectAlert?.project.name ?? ""}» будет удалён из списка.`
            : undefined
        }
        value={projectAlert?.type === "rename" ? projectAlert.project.name : ""}
        inputLabel={projectAlert?.type === "rename" ? "Новое имя проекта" : undefined}
        placeholder="Введите имя проекта"
        confirmText={isDeleteAlert ? "Удалить" : "Сохранить"}
        cancelText="Отмена"
        onConfirm={handleProjectAlertConfirm}
        onCancel={handleProjectAlertCancel}
      />
    </div>
  );
};

// view-transition-name изолирует бар от VT — он не попадает в снапшоты
// и рендерится поверх обоих слоёв circular reveal как независимый элемент.
const themeProgressStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  height: 3,
  width: "0%",
  opacity: 0,
  background: "var(--primary)",
  zIndex: 99999,
  pointerEvents: "none",
  borderRadius: "0 2px 2px 0",
  viewTransitionName: "theme-progress",
} as React.CSSProperties;

export default App;
