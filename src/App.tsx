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

type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;

  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;

  onEvent?: (eventType: "viewportChanged", eventHandler: () => void) => void;
  offEvent?: (eventType: "viewportChanged", eventHandler: () => void) => void;
};

const STORAGE_KEY = "beadly-projects-v1";
const BASE_COLOR = "#ffffff";

function getTG(): TelegramWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram
    ?.WebApp;
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

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (!tg) return false;

  const platform = tg.platform?.toLowerCase() ?? "";

  const isMobileTelegramPlatform =
    platform === "ios" ||
    platform === "android" ||
    platform === "android_x";

  const userAgent = navigator.userAgent.toLowerCase();

  const isRealMobileUserAgent =
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod") ||
    userAgent.includes("android") ||
    userAgent.includes("mobile");

  const isTouchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true;

  return isMobileTelegramPlatform || (isRealMobileUserAgent && isTouchDevice);
};

const updateTelegramViewportVars = () => {
  const tg = getTG();
  const root = document.documentElement;

  const viewportHeight =
    tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight;

  const stableHeight =
    tg?.viewportStableHeight ??
    window.visualViewport?.height ??
    window.innerHeight;

  const safeTop = Math.max(
    tg?.safeAreaInset?.top ?? 0,
    tg?.contentSafeAreaInset?.top ?? 0,
  );

  const safeBottom = Math.max(
    tg?.safeAreaInset?.bottom ?? 0,
    tg?.contentSafeAreaInset?.bottom ?? 0,
  );

  const mobileTelegram = isTelegramMobile(tg);

  const topNavigationSpace = mobileTelegram
    ? Math.max(96, safeTop + 76)
    : 0;

  root.style.setProperty("--app-height", `${viewportHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableHeight}px`);
  root.style.setProperty("--tg-safe-top", `${safeTop}px`);
  root.style.setProperty("--tg-safe-bottom", `${safeBottom}px`);
  root.style.setProperty("--tg-top-navigation-space", `${topNavigationSpace}px`);

  root.classList.toggle("tg-mobile", mobileTelegram);
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

    updateTelegramViewportVars();

    const handleViewportUpdate = () => {
      updateTelegramViewportVars();
    };

    tg?.onEvent?.("viewportChanged", handleViewportUpdate);
    window.visualViewport?.addEventListener("resize", handleViewportUpdate);
    window.addEventListener("resize", handleViewportUpdate);

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;

      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;

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
      tg?.offEvent?.("viewportChanged", handleViewportUpdate);
      window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
      window.removeEventListener("resize", handleViewportUpdate);

      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);

      document.documentElement.classList.remove("tg-mobile");
    };
  }, []);

  const handleCreateGrid = (seed: GridSeed) => {
    const project = createProjectFromSeed(seed);

    setProjects((prev) => {
      const filtered = prev.filter((item) => item.id !== project.id);
      return [project, ...filtered];
    });

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