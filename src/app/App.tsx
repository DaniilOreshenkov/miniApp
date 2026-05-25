/**
 * Корневой контейнер приложения.
 *
 * Зона ответственности:
 * - хранит глобальное состояние: текущий экран, проекты, активный проект, тему;
 * - подключает жизненный цикл Telegram/WebView;
 * - передаёт данные в экраны и принимает действия пользователя через callbacks;
 * - показывает единый кастомный ThemedAlert вместо системных prompt/confirm.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import HomeScreen from "../screens/HomeScreen";
import GridScreen from "../screens/GridScreen";
import ThemedAlert from "../components/ThemedAlert";
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
import { initTelegramViewport } from "./telegramViewport";
import { initAppTouchLock } from "./touchLock";

type Screen = "home" | "grid";
type ProjectAlertState =
  | { type: "rename"; project: GridProject }
  | { type: "delete"; project: GridProject };

const PROJECTS_SAVE_DEBOUNCE_MS = 180;
const THEME_CROSSFADE_MS = 220;
const THEME_SWITCH_LOCK_MS = THEME_CROSSFADE_MS + 80;

const getNextFrame = (callback: () => void) => {
  if (typeof window === "undefined") return 0;
  return window.requestAnimationFrame(callback);
};

const App = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [themeFade, setThemeFade] = useState<{ visible: boolean; background: string } | null>(null);
  const [gridData, setGridData] = useState<GridData>(null);
  const [projectAlert, setProjectAlert] = useState<ProjectAlertState | null>(null);

  const themeFadeTimeoutRef = useRef<number | null>(null);
  const themeSwitchUnlockTimeoutRef = useRef<number | null>(null);
  const themeFadeRafRef = useRef<number | null>(null);
  const isThemeSwitchingRef = useRef(false);
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
  useLayoutEffect(() => {
    applyAppTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Чистим служебные таймеры плавного переключения темы при размонтировании.
  useEffect(() => {
    return () => {
      if (themeFadeTimeoutRef.current !== null) {
        window.clearTimeout(themeFadeTimeoutRef.current);
      }

      if (themeFadeRafRef.current !== null) {
        window.cancelAnimationFrame(themeFadeRafRef.current);
      }

      if (themeSwitchUnlockTimeoutRef.current !== null) {
        window.clearTimeout(themeSwitchUnlockTimeoutRef.current);
      }

      isThemeSwitchingRef.current = false;
    };
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
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushProjectsSave();
      }
    };

    window.addEventListener("pagehide", flushProjectsSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushProjectsSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushProjectsSave();
    };
  }, [flushProjectsSave]);

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
    setScreen("grid");
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

  const handleThemeToggle = useCallback(() => {
    if (typeof window === "undefined") {
      setTheme((currentTheme) => getNextTheme(currentTheme));
      return;
    }

    // Защита от серии быстрых нажатий по switch.
    // Без неё Telegram WebView может получить несколько смен темы подряд,
    // из-за чего overlay и CSS-переменные начинают конкурировать между собой.
    if (isThemeSwitchingRef.current) return;

    isThemeSwitchingRef.current = true;

    const nextTheme = getNextTheme(theme);

    if (themeFadeTimeoutRef.current !== null) {
      window.clearTimeout(themeFadeTimeoutRef.current);
      themeFadeTimeoutRef.current = null;
    }

    if (themeSwitchUnlockTimeoutRef.current !== null) {
      window.clearTimeout(themeSwitchUnlockTimeoutRef.current);
      themeSwitchUnlockTimeoutRef.current = null;
    }

    if (themeFadeRafRef.current !== null) {
      window.cancelAnimationFrame(themeFadeRafRef.current);
      themeFadeRafRef.current = null;
    }

    // Один fixed overlay заметно легче, чем transition на всех карточках,
    // кнопках и текстах. Тема меняется сразу, а overlay только маскирует смену.
    setThemeFade({
      visible: true,
      background: getThemeBackgroundColor(theme),
    });

    themeFadeRafRef.current = getNextFrame(() => {
      setTheme(nextTheme);

      themeFadeRafRef.current = getNextFrame(() => {
        setThemeFade((currentFade) => {
          if (!currentFade) return currentFade;

          return {
            ...currentFade,
            visible: false,
          };
        });

        themeFadeTimeoutRef.current = window.setTimeout(() => {
          setThemeFade(null);
          themeFadeTimeoutRef.current = null;
        }, THEME_CROSSFADE_MS);

        themeSwitchUnlockTimeoutRef.current = window.setTimeout(() => {
          isThemeSwitchingRef.current = false;
          themeSwitchUnlockTimeoutRef.current = null;
        }, THEME_SWITCH_LOCK_MS);
      });
    });
  }, [theme]);

  const handleBackToHome = useCallback(() => {
    setScreen("home");
  }, []);

  const isDeleteAlert = projectAlert?.type === "delete";

  return (
    <div className="app-shell">
      {themeFade ? (
        <div
          aria-hidden="true"
          className={
            themeFade.visible
              ? "theme-crossfade-overlay theme-crossfade-overlay-visible"
              : "theme-crossfade-overlay"
          }
          style={{ background: themeFade.background }}
        />
      ) : null}

      {screen === "home" ? (
        <HomeScreen
          onCreateGrid={handleCreateGrid}
          onOpenProject={handleOpenProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          projects={projects}
          theme={theme}
          onThemeToggle={handleThemeToggle}
        />
      ) : (
        <GridScreen
          data={gridData}
          onSave={handleSaveProject}
          onBack={handleBackToHome}
        />
      )}

      <ThemedAlert
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

export default App;
