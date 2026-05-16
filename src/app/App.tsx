/**
 * Корневой контейнер приложения.
 *
 * Зона ответственности:
 * - хранит глобальное состояние: текущий экран, проекты, активный проект, тему;
 * - подключает жизненный цикл Telegram/WebView;
 * - передаёт данные в экраны и принимает действия пользователя через callbacks.
 *
 * Сложную доменную логику лучше держать вне этого файла. Логика проектов
 * должна жить в `entities/project`, логика редактора — в `features/*`,
 * а переиспользуемый интерфейс — в компонентах.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import HomeScreen from "../screens/HomeScreen";
import GridScreen from "../screens/GridScreen";
import type { GridData, GridProject, GridSeed } from "../entities/project/types";
import {
  createProjectFromSeed,
  formatProjectUpdatedAt,
  loadProjects,
  saveProjects,
  upsertProject,
} from "../entities/project/storage";
import type { AppTheme } from "./theme";
import { applyAppTheme, getNextTheme, getStoredTheme, saveTheme } from "./theme";
import { initTelegramViewport } from "./telegramViewport";
import { initAppTouchLock } from "./touchLock";

type Screen = "home" | "grid";

const PROJECTS_SAVE_DEBOUNCE_MS = 180;

const App = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [gridData, setGridData] = useState<GridData>(null);

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

  /** Переименовывает проект в списке и в активных данных редактора. */
  const handleRenameProject = useCallback((project: GridProject) => {
    const nextName = window.prompt("Новое имя проекта", project.name)?.trim();

    if (!nextName) return;

    const updatedAt = formatProjectUpdatedAt();

    setProjects((prev) =>
      prev.map((item) =>
        item.id === project.id
          ? {
              ...item,
              name: nextName,
              updatedAt,
            }
          : item,
      ),
    );

    setGridData((prev) => {
      if (!prev || prev.id !== project.id) return prev;

      return {
        ...prev,
        name: nextName,
        updatedAt,
      };
    });
  }, []);

  /** Удаляет проект и безопасно закрывает редактор, если удалённый проект был открыт. */
  const handleDeleteProject = useCallback(
    (project: GridProject) => {
      const accepted = window.confirm(`Удалить проект "${project.name}"?`);

      if (!accepted) return;

      setProjects((prev) => prev.filter((item) => item.id !== project.id));

      setGridData((prev) => {
        if (!prev || prev.id !== project.id) return prev;
        return null;
      });

      if (gridData?.id === project.id) {
        setScreen("home");
      }
    },
    [gridData?.id],
  );

  const handleThemeToggle = useCallback(() => {
    setTheme((currentTheme) => getNextTheme(currentTheme));
  }, []);

  const handleBackToHome = useCallback(() => {
    setScreen("home");
  }, []);

  return (
    <div className="app-shell">
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
    </div>
  );
};

export default App;
