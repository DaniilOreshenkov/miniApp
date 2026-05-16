/**
 * Хранение проектов и фабричные helper-функции.
 *
 * Этот модуль — единственное место, которое должно знать, как проекты хранятся
 * в localStorage. Экраны и компоненты должны вызывать эти функции,
 * а не обращаться к localStorage напрямую.
 */

import type { GridProject, GridSeed } from "./types";
import { createEmptyCells, getGridCellCount } from "./grid";

export const PROJECTS_STORAGE_KEY = "beadly-projects-v1";

/** Создаёт стабильный id проекта с безопасным fallback для старых WebView. */
export const createProjectId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

/** Форматирует дату обновления проекта для компактных мобильных карточек. */
export const formatProjectUpdatedAt = () => {
  const now = new Date();

  return now.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Runtime-проверка данных пользователя/localStorage перед попаданием в состояние приложения. */
export const isGridProject = (value: unknown): value is GridProject => {
  if (!value || typeof value !== "object") return false;

  const project = value as Record<string, unknown>;

  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.width === "number" &&
    typeof project.height === "number" &&
    Array.isArray(project.cells) &&
    project.cells.every((cell) => typeof cell === "string") &&
    typeof project.updatedAt === "string"
  );
};

/** Загружает сохранённые проекты. Некорректные записи игнорируются, не ломая приложение. */
export const loadProjects = (): GridProject[] => {
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isGridProject);
  } catch {
    return [];
  }
};

/** Сохраняет текущий список проектов. Ошибки storage намеренно не считаются критичными. */
export const saveProjects = (projects: GridProject[]) => {
  try {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // localStorage может быть недоступен. В текущей сессии state всё равно работает.
  }
};

/** Нормализует импортированные/пользовательские данные и возвращает полный объект проекта. */
export const createProjectFromSeed = (seed: GridSeed): GridProject => {
  const width = Math.max(1, seed.width);
  const height = Math.max(1, seed.height);
  const expectedCount = getGridCellCount(width, height);

  const cells =
    Array.isArray(seed.cells) && seed.cells.length === expectedCount
      ? seed.cells
      : createEmptyCells(width, height);

  return {
    id: createProjectId(),
    name: seed.name.trim() || "Новый проект",
    width,
    height,
    cells,
    updatedAt: formatProjectUpdatedAt(),
    backgroundColor: seed.backgroundColor,
    backgroundImageUrl: seed.backgroundImageUrl,
    canvasPaddingPercent: seed.canvasPaddingPercent,
    textLayers: Array.isArray(seed.textLayers) ? seed.textLayers : undefined,
    shapeLayers: Array.isArray(seed.shapeLayers) ? seed.shapeLayers : undefined,
    activeShapeLayerId: seed.activeShapeLayerId,
  };
};

/** Добавляет проект в начало списка или заменяет существующий проект с таким же id. */
export const upsertProject = (
  projects: GridProject[],
  project: GridProject,
): GridProject[] => {
  const filtered = projects.filter((item) => item.id !== project.id);
  return [project, ...filtered];
};
