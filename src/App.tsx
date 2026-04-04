import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

export type GridSeed = {
  name: string;
  width: number;
  height: number;
  cells?: string[];
};

export type GridProject = {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: string[];
  updatedAt: string;
};

export type GridData = GridProject | null;

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
};

const STORAGE_KEY = "beadly-projects-v1";
const BASE_COLOR = "#ffffff";

function getTG(): TelegramWebApp | undefined {
  return (window as any).Telegram?.WebApp;
}

const createProjectId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const formatUpdatedAt = () => {
  const now = new Date();

  return now.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getCellCount = (width: number, height: number) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const rowCount = safeHeight * 2 + 1;
  let total = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    total += rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  }

  return total;
};

const createEmptyCells = (width: number, height: number) => {
  return Array.from({ length: getCellCount(width, height) }, () => BASE_COLOR);
};

const isGridProject = (value: unknown): value is GridProject => {
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

const loadProjects = (): GridProject[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isGridProject);
  } catch {
    return [];
  }
};

const createProjectFromSeed = (seed: GridSeed): GridProject => {
  const width = Math.max(1, seed.width);
  const height = Math.max(1, seed.height);
  const expectedCount = getCellCount(width, height);

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
    updatedAt: formatUpdatedAt(),
  };
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [gridData, setGridData] = useState<GridData>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    const tg = getTG();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    tg?.requestFullscreen?.();

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];

      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);

      const target = e.target as HTMLElement;

      const isScroll = target.closest(".app-scroll");
      const isFixed = target.closest(".app-fixed");

      if (isScroll && dy > dx) {
        return;
      }

      if (isFixed) {
        e.preventDefault();
        return;
      }

      if (dx > dy) {
        e.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, {
      passive: true,
      capture: true,
    });

    document.addEventListener("touchmove", onTouchMove, {
      passive: false,
      capture: true,
    });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
    };
  }, []);

  const handleCreateGrid = (seed: GridSeed) => {
    const project = createProjectFromSeed(seed);
    setGridData(project);
    setScreen("grid");
  };

  const handleOpenProject = (project: GridProject) => {
    setGridData(project);
    setScreen("grid");
  };

  const handleSaveProject = (project: GridProject) => {
    const nextProject: GridProject = {
      ...project,
      updatedAt: formatUpdatedAt(),
    };

    setProjects((prev) => {
      const filtered = prev.filter((item) => item.id !== nextProject.id);
      return [nextProject, ...filtered];
    });

    setGridData(nextProject);
  };

  const handleRenameProject = (project: GridProject) => {
    const nextName = window.prompt("Новое имя проекта", project.name)?.trim();

    if (!nextName) return;

    setProjects((prev) =>
      prev.map((item) =>
        item.id === project.id
          ? {
              ...item,
              name: nextName,
              updatedAt: formatUpdatedAt(),
            }
          : item,
      ),
    );

    setGridData((prev) => {
      if (!prev || prev.id !== project.id) return prev;

      return {
        ...prev,
        name: nextName,
        updatedAt: formatUpdatedAt(),
      };
    });
  };

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

  return (
    <div className="app-shell">
      {screen === "home" ? (
        <HomeScreen
          onCreateGrid={handleCreateGrid}
          onOpenProject={handleOpenProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          projects={projects}
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
}