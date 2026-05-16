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

import { useEffect, useState } from "react";
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

const App = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [gridData, setGridData] = useState<GridData>(null);

  // Применяем выбранную тему на уровне документа и сохраняем её между сессиями.
  useEffect(() => {
    applyAppTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Сохраняем каждое изменение списка проектов. Слой хранения изолирован в entities/project.
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

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
  const handleCreateGrid = (seed: GridSeed) => {
    const project = createProjectFromSeed(seed);

    setProjects((prev) => upsertProject(prev, project));
    setGridData(project);
    setScreen("grid");
  };

  /** Открывает существующий проект без изменения его данных. */
  const handleOpenProject = (project: GridProject) => {
    setGridData(project);
    setScreen("grid");
  };

  /** Сохраняет изменения из редактора и поднимает проект в начало списка. */
  const handleSaveProject = (project: GridProject) => {
    const nextProject: GridProject = {
      ...project,
      updatedAt: formatProjectUpdatedAt(),
    };

    setProjects((prev) => upsertProject(prev, nextProject));
    setGridData(nextProject);
  };

  /** Переименовывает проект в списке и в активных данных редактора. */
  const handleRenameProject = (project: GridProject) => {
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
  };

  /** Удаляет проект и безопасно закрывает редактор, если удалённый проект был открыт. */
  const handleDeleteProject = (project: GridProject) => {
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
  };

  const handleThemeToggle = () => {
    setTheme((currentTheme) => getNextTheme(currentTheme));
  };

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
          onBack={() => setScreen("home")}
        />
      )}
    </div>
  );
};

export default App;
