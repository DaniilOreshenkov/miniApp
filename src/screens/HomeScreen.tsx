import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCard from "../components/ProjectCard";
import TabBar, { type HomeTab } from "../components/TabBar";
import CreateProjectSheet from "../components/CreateProjectSheet";
import { mockProjects } from "../models/project";
import TemplatesScreen from "./TemplatesScreen";
import ProjectsScreen from "./ProjectsScreen";

interface Props {
  onCreateGrid: () => void;
}

const COLLAPSE_SCROLL = 72;
const SWIPE_THRESHOLD = 44;
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const TAB_BAR_SAFE_SPACE = 160;
const HOME_TOP_CONTROLS_SPACE = 86;

const tabOrder: HomeTab[] = ["home", "templates", "projects"];

const HomeScreen: React.FC<Props> = ({ onCreateGrid }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestScrollRef = useRef(0);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const hasProjects = mockProjects.length > 0;
  const latestProjects = mockProjects.slice(0, 10);

  const openCreateSheet = () => setCreateSheetOpen(true);
  const closeCreateSheet = () => setCreateSheetOpen(false);

  const handleCreateGrid = () => {
    onCreateGrid();
    setCreateSheetOpen(false);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    latestScrollRef.current = event.currentTarget.scrollTop;
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
    });
  };

  const switchTabByDirection = (direction: "left" | "right") => {
    const currentIndex = tabOrder.indexOf(activeTab);

    if (direction === "left") {
      setActiveTab(tabOrder[Math.min(currentIndex + 1, tabOrder.length - 1)]);
    } else {
      setActiveTab(tabOrder[Math.max(currentIndex - 1, 0)]);
    }
  };

  const handleTabbarTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchCurrentRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTabbarTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchCurrentRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTabbarTouchEnd = () => {
    const start = touchStartRef.current;
    const end = touchCurrentRef.current;

    if (!start || !end) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      switchTabByDirection(dx < 0 ? "left" : "right");
    }
  };

  const homeContent = (
    <>
      <section style={sectionStyle}>
        <button onClick={openCreateSheet} style={primaryButtonStyle}>
          + Создать сетку
        </button>
      </section>

      {hasProjects && (
        <section style={sectionStyle}>
          <h2 style={ui.sectionTitle}>Последние проекты</h2>
          <div style={projectsListStyle}>
            {latestProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={onCreateGrid}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );

  const content = useMemo(() => {
    if (activeTab === "home") return homeContent;

    if (activeTab === "templates") {
      return (
        <div style={tabSafe}>
          <TemplatesScreen />
        </div>
      );
    }

    return (
      <div style={tabSafe}>
        <ProjectsScreen
          projects={mockProjects}
          onProjectClick={onCreateGrid}
        />
      </div>
    );
  }, [activeTab]);

  return (
    <div style={rootStyle}>
      <div
        ref={scrollContainerRef}
        style={scrollAreaStyle}
        onScroll={handleScroll}
      >
        <main style={mainStyle}>{content}</main>
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        onTouchStart={handleTabbarTouchStart}
        onTouchMove={handleTabbarTouchMove}
        onTouchEnd={handleTabbarTouchEnd}
      />

      <CreateProjectSheet
        open={createSheetOpen}
        onClose={closeCreateSheet}
        onCreate={handleCreateGrid}
        projectName=""
        gridWidth=""
        gridHeight=""
        isProjectNameValid
        isWidthValid
        isHeightValid
        isCreateDisabled={false}
        onProjectNameChange={() => {}}
        onGridWidthChange={() => {}}
        onGridHeightChange={() => {}}
        onGridWidthBlur={() => {}}
        onGridHeightBlur={() => {}}
      />
    </div>
  );
};

export default HomeScreen;

/* ================= STYLES ================= */

const rootStyle: React.CSSProperties = {
  ...ui.page,
  height: "100%",
  overflow: "hidden",
};

const scrollAreaStyle: React.CSSProperties = {
  ...ui.contentWrapper,
  height: "100%",
  paddingBottom: TAB_BAR_SAFE_SPACE,
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
  paddingTop: 20,
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const primaryButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  padding: "16px",
  borderRadius: 16,
};

const tabSafe: React.CSSProperties = {
  width: "100%",
  maxWidth: 860,
  margin: "0 auto",
  padding: "0 18px",
  boxSizing: "border-box",
};