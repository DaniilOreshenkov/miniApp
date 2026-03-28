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
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const TAB_BAR_SAFE_SPACE = 160;
const HOME_TOP_CONTROLS_SPACE = 86;

const sanitizeNumericInput = (value: string) => value.replace(/\D/g, "");

const isGridValueValid = (value: string) => {
  if (value.trim() === "") return false;
  const numericValue = Number(value);

  return (
    Number.isInteger(numericValue) &&
    numericValue >= MIN_GRID_SIZE &&
    numericValue <= MAX_GRID_SIZE
  );
};

const clampGridValueOnBlur = (value: string) => {
  if (value.trim() === "") return "";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "";
  if (numericValue < MIN_GRID_SIZE) return String(MIN_GRID_SIZE);
  if (numericValue > MAX_GRID_SIZE) return String(MAX_GRID_SIZE);

  return String(numericValue);
};

const HomeScreen: React.FC<Props> = ({ onCreateGrid }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth] = useState("");
  const [gridHeight, setGridHeight] = useState("");

  const [tabContentVisible, setTabContentVisible] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const textWrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestScrollRef = useRef(0);
  const tabAnimationRafRef = useRef<number | null>(null);

  const hasProjects = mockProjects.length > 0;
  const latestProjects = mockProjects.slice(0, 10);

  const isProjectNameValid = projectName.trim().length > 0;
  const isWidthValid = isGridValueValid(gridWidth);
  const isHeightValid = isGridValueValid(gridHeight);
  const isCreateDisabled =
    !isProjectNameValid || !isWidthValid || !isHeightValid;

  const openCreateSheet = () => {
    setCreateSheetOpen(true);
  };

  const closeCreateSheet = () => {
    setCreateSheetOpen(false);
  };

  const handleCreateGrid = () => {
    if (isCreateDisabled) return;

    onCreateGrid();
    setCreateSheetOpen(false);
  };

  const applyHeroAnimation = (scrollTop: number) => {
    const sticky = stickyRef.current;
    const textWrap = textWrapRef.current;
    const button = buttonRef.current;

    if (!sticky || !textWrap || !button) return;

    const progress = Math.min(Math.max(scrollTop / COLLAPSE_SCROLL, 0), 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    sticky.style.paddingTop = `${18 - 4 * eased}px`;
    sticky.style.paddingBottom = `${20 - 8 * eased}px`;

    textWrap.style.opacity = `${1 - eased}`;
    textWrap.style.transform = `translateY(${-10 * eased}px) scale(${1 - 0.05 * eased})`;
    textWrap.style.maxHeight = `${132 - 132 * eased}px`;
    textWrap.style.marginBottom = `${18 - 18 * eased}px`;

    button.style.minHeight = `${76 - 12 * eased}px`;
    button.style.fontSize = `${20 - 2 * eased}px`;
    button.style.borderRadius = `${24 - 4 * eased}px`;
    button.style.transform = `translateY(${-2 * eased}px)`;
    button.style.boxShadow = `0 ${16 - 6 * eased}px ${34 - 10 * eased}px rgba(0,0,0,${0.26 - 0.1 * eased})`;
  };

  useEffect(() => {
    if (activeTab === "home") {
      applyHeroAnimation(latestScrollRef.current);
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (tabAnimationRafRef.current !== null)
        cancelAnimationFrame(tabAnimationRafRef.current);
    };
  }, [activeTab]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setTabContentVisible(false);
    latestScrollRef.current = 0;

    container.scrollTo({ top: 0 });

    if (activeTab === "home") {
      requestAnimationFrame(() => applyHeroAnimation(0));
    }

    tabAnimationRafRef.current = requestAnimationFrame(() => {
      tabAnimationRafRef.current = requestAnimationFrame(() => {
        setTabContentVisible(true);
      });
    });
  }, [activeTab]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    latestScrollRef.current = event.currentTarget.scrollTop;

    if (activeTab !== "home") return;
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      applyHeroAnimation(latestScrollRef.current);
      rafRef.current = null;
    });
  };

  const homeContent = (
    <>
      <section ref={stickyRef} style={stickyHeroWrapStyle}>
        <div ref={textWrapRef} style={heroTextWrapStyle}>
          <div style={appTitleStyle}>Beadly</div>
          <h1 style={heroTitleStyle}>
            Создавай схемы быстро и красиво
          </h1>
        </div>

        <button
          ref={buttonRef}
          onClick={openCreateSheet}
          style={primaryButtonStyle}
        >
          + Создать сетку
        </button>
      </section>

      {hasProjects && (
        <section style={sectionStyle}>
          <div style={sectionHeaderRowStyle}>
            <h2 style={ui.sectionTitle}>Последние проекты</h2>

            <button
              style={ghostButtonStyle}
              onClick={() => setActiveTab("projects")}
            >
              Все
            </button>
          </div>

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
    if (activeTab === "templates") return <TemplatesScreen />;
    return (
      <ProjectsScreen
        projects={mockProjects}
        onProjectClick={onCreateGrid}
      />
    );
  }, [activeTab]);

  return (
    <div style={rootStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div
        ref={scrollContainerRef}
        style={scrollAreaStyle}
        onScroll={handleScroll}
      >
        <main
          style={{
            ...mainStyle,
            opacity: tabContentVisible ? 1 : 0,
          }}
        >
          {content}
        </main>
      </div>

      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <CreateProjectSheet
        open={createSheetOpen}
        projectName={projectName}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        isProjectNameValid={isProjectNameValid}
        isWidthValid={isWidthValid}
        isHeightValid={isHeightValid}
        isCreateDisabled={isCreateDisabled}
        onClose={closeCreateSheet}
        onCreate={handleCreateGrid}
        onProjectNameChange={setProjectName}
        onGridWidthChange={(v) =>
          setGridWidth(sanitizeNumericInput(v))
        }
        onGridHeightChange={(v) =>
          setGridHeight(sanitizeNumericInput(v))
        }
        onGridWidthBlur={() =>
          setGridWidth((prev) => clampGridValueOnBlur(prev))
        }
        onGridHeightBlur={() =>
          setGridHeight((prev) => clampGridValueOnBlur(prev))
        }
      />
    </div>
  );
};

export default HomeScreen;