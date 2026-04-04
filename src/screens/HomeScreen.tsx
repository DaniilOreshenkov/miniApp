import React, { useEffect, useMemo, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import ProjectCard from "../components/ProjectCard";
import TabBar, { type HomeTab } from "../components/TabBar";
import CreateProjectSheet from "../components/CreateProjectSheet";
import { mockProjects, type ProjectItem } from "../models/project";
import TemplatesScreen from "./TemplatesScreen";
import ProjectsScreen from "./ProjectsScreen";
import type { GridProject, GridSeed } from "../App";

interface Props {
  onCreateGrid: (data: GridSeed) => void;
  onOpenProject: (project: GridProject) => void;
  onRenameProject: (project: GridProject) => void;
  onDeleteProject: (project: GridProject) => void;
  projects: GridProject[];
}

const COLLAPSE_SCROLL = 72;
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const TAB_BAR_SAFE_SPACE = 160;
const HOME_TOP_CONTROLS_SPACE = 86;
const MAX_IMPORT_SIZE = 100;

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

const parseGridSizeFromSubtitle = (subtitle: string) => {
  const match = subtitle.match(/(\d+)\s*[×xXхХ]\s*(\d+)/);

  if (!match) {
    return { width: 10, height: 10 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
};

const getMockProjectSeed = (project: ProjectItem): GridSeed => {
  const { width, height } = parseGridSizeFromSubtitle(project.subtitle);

  return {
    name: project.title,
    width,
    height,
  };
};

const toProjectItem = (project: GridProject): ProjectItem => {
  return {
    id: project.id,
    title: project.name,
    subtitle: `${project.width}×${project.height} • схема`,
    updatedAt: project.updatedAt,
  };
};

const bead = 24;
const horizontalSpacing = 6;
const stretchX = 1.12;

const xStep = (bead + horizontalSpacing) * stretchX;
const yStep = Math.sqrt(bead * bead - (xStep / 2) * (xStep / 2));

const stripExtension = (name: string) => {
  return name.replace(/\.[^.]+$/, "");
};

const getImportSizeFromImage = (image: HTMLImageElement) => {
  const rawWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const rawHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const scale = Math.min(MAX_IMPORT_SIZE / rawWidth, MAX_IMPORT_SIZE / rawHeight, 1);

  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
  };
};

const loadImageFromFile = (file: File) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось загрузить PNG"));
    };

    image.src = objectUrl;
  });
};

const rgbToHex = (red: number, green: number, blue: number) => {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
};

const importPngToCells = async (file: File, width: number, height: number) => {
  const image = await loadImageFromFile(file);

  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const rowCount = safeHeight * 2 + 1;
  const maxRowLength = safeWidth + 1;
  const boardWidth = (maxRowLength - 1) * xStep + bead;
  const boardHeight = (rowCount - 1) * yStep + bead;

  const sampleCanvas = document.createElement("canvas");
  const sampleWidth = Math.max(320, Math.min(1600, maxRowLength * 8));
  const sampleHeight = Math.max(320, Math.min(2200, rowCount * 8));

  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;

  const context = sampleCanvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить PNG");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sampleWidth, sampleHeight);
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const cells: string[] = [];

  const getRowLength = (rowIndex: number) => {
    return rowIndex % 2 === 0 ? safeWidth : safeWidth + 1;
  };

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowLength = getRowLength(rowIndex);
    const rowStartX = rowLength === maxRowLength ? 0 : xStep / 2;

    for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
      const centerX = rowStartX + columnIndex * xStep + bead / 2;
      const centerY = rowIndex * yStep + bead / 2;

      const normalizedX = boardWidth <= 0 ? 0.5 : centerX / boardWidth;
      const normalizedY = boardHeight <= 0 ? 0.5 : centerY / boardHeight;

      const pixelX = Math.max(
        0,
        Math.min(sampleWidth - 1, Math.round(normalizedX * (sampleWidth - 1))),
      );
      const pixelY = Math.max(
        0,
        Math.min(sampleHeight - 1, Math.round(normalizedY * (sampleHeight - 1))),
      );

      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(sampleWidth - 1, pixelX + offsetX));
          const sampleY = Math.max(0, Math.min(sampleHeight - 1, pixelY + offsetY));
          const index = (sampleY * sampleWidth + sampleX) * 4;

          const alpha = imageData[index + 3];
          if (alpha < 16) continue;

          red += imageData[index];
          green += imageData[index + 1];
          blue += imageData[index + 2];
          count += 1;
        }
      }

      if (count === 0) {
        cells.push("#ffffff");
      } else {
        cells.push(rgbToHex(red / count, green / count, blue / count));
      }
    }
  }

  return cells;
};

const HomeScreen: React.FC<Props> = ({
  onCreateGrid,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  projects,
}) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [gridWidth, setGridWidth] = useState("");
  const [gridHeight, setGridHeight] = useState("");
  const [isImportingPng, setIsImportingPng] = useState(false);

  const [tabContentVisible, setTabContentVisible] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const textWrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const importButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestScrollRef = useRef(0);
  const tabAnimationRafRef = useRef<number | null>(null);

  const savedProjectItems = useMemo(() => {
    return projects.map(toProjectItem);
  }, [projects]);

  const hasSavedProjects = savedProjectItems.length > 0;
  const latestProjects = hasSavedProjects
    ? savedProjectItems.slice(0, 10)
    : mockProjects.slice(0, 10);

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

    onCreateGrid({
      name: projectName.trim(),
      width: Number(gridWidth),
      height: Number(gridHeight),
    });

    setCreateSheetOpen(false);
  };

  const handleImportButtonClick = () => {
    if (isImportingPng) return;
    fileInputRef.current?.click();
  };

  const handleImportPng = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setIsImportingPng(true);

      const image = await loadImageFromFile(file);
      const { width, height } = getImportSizeFromImage(image);
      const cells = await importPngToCells(file, width, height);

      onCreateGrid({
        name: stripExtension(file.name) || "Импорт PNG",
        width,
        height,
        cells,
      });
    } catch {
      window.alert("Не удалось импортировать PNG");
    } finally {
      setIsImportingPng(false);
    }
  };

  const openLatestProject = (projectItem: ProjectItem) => {
    if (hasSavedProjects) {
      const savedProject = projects.find((project) => project.id === projectItem.id);
      if (savedProject) {
        onOpenProject(savedProject);
      }
      return;
    }

    onCreateGrid(getMockProjectSeed(projectItem));
  };

  const renameProject = (projectItem: ProjectItem) => {
    const savedProject = projects.find((project) => project.id === projectItem.id);
    if (!savedProject) return;

    onRenameProject(savedProject);
  };

  const deleteProject = (projectItem: ProjectItem) => {
    const savedProject = projects.find((project) => project.id === projectItem.id);
    if (!savedProject) return;

    onDeleteProject(savedProject);
  };

  const applyHeroAnimation = (scrollTop: number) => {
    const sticky = stickyRef.current;
    const textWrap = textWrapRef.current;
    const button = buttonRef.current;
    const importButton = importButtonRef.current;

    if (!sticky || !textWrap || !button || !importButton) return;

    const progress = Math.min(Math.max(scrollTop / COLLAPSE_SCROLL, 0), 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const paddingTop = 18 - 4 * eased;
    const paddingBottom = 20 - 8 * eased;

    const textOpacity = 1 - eased;
    const textTranslateY = -10 * eased;
    const textScale = 1 - 0.05 * eased;
    const textHeight = 132 - 132 * eased;
    const textMarginBottom = 18 - 18 * eased;

    const buttonHeight = 76 - 12 * eased;
    const buttonFontSize = 20 - 2 * eased;
    const buttonRadius = 24 - 4 * eased;
    const buttonShadowY = 16 - 6 * eased;
    const buttonShadowBlur = 34 - 10 * eased;
    const buttonShadowOpacity = 0.26 - 0.1 * eased;
    const buttonTranslateY = -2 * eased;

    sticky.style.paddingTop = `${paddingTop}px`;
    sticky.style.paddingBottom = `${paddingBottom}px`;

    textWrap.style.opacity = `${textOpacity}`;
    textWrap.style.transform = `translateY(${textTranslateY}px) scale(${textScale})`;
    textWrap.style.maxHeight = `${textHeight}px`;
    textWrap.style.marginBottom = `${textMarginBottom}px`;

    [button, importButton].forEach((target) => {
      target.style.minHeight = `${buttonHeight}px`;
      target.style.fontSize = `${buttonFontSize}px`;
      target.style.borderRadius = `${buttonRadius}px`;
      target.style.transform = `translateY(${buttonTranslateY}px)`;
      target.style.boxShadow = `0 ${buttonShadowY}px ${buttonShadowBlur}px rgba(0,0,0,${buttonShadowOpacity})`;
    });
  };

  useEffect(() => {
    if (activeTab === "home") {
      applyHeroAnimation(latestScrollRef.current);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (tabAnimationRafRef.current !== null) {
        cancelAnimationFrame(tabAnimationRafRef.current);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setTabContentVisible(false);

    latestScrollRef.current = 0;
    container.scrollTo({
      top: 0,
      behavior: "auto",
    });

    if (activeTab === "home") {
      requestAnimationFrame(() => applyHeroAnimation(0));
    }

    tabAnimationRafRef.current = requestAnimationFrame(() => {
      tabAnimationRafRef.current = requestAnimationFrame(() => {
        setTabContentVisible(true);
      });
    });

    return () => {
      if (tabAnimationRafRef.current !== null) {
        cancelAnimationFrame(tabAnimationRafRef.current);
      }
    };
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
          <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>
        </div>

        <div style={heroButtonsStackStyle}>
          <button
            ref={buttonRef}
            onClick={openCreateSheet}
            style={primaryButtonStyle}
            type="button"
          >
            + Создать сетку
          </button>

          <button
            ref={importButtonRef}
            onClick={handleImportButtonClick}
            style={secondaryHeroButtonStyle}
            type="button"
            disabled={isImportingPng}
          >
            {isImportingPng ? "Импорт PNG..." : "Импорт PNG"}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          onChange={handleImportPng}
          style={{ display: "none" }}
        />
      </section>

      {latestProjects.length > 0 && (
        <section style={sectionStyle}>
          <div style={sectionHeaderRowStyle}>
            <h2 style={ui.sectionTitle}>Последние проекты</h2>

            <button
              style={ghostButtonStyle}
              onClick={() => setActiveTab("projects")}
              type="button"
            >
              Все
            </button>
          </div>

          <div style={projectsListStyle}>
            {latestProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => openLatestProject(project)}
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
        projects={hasSavedProjects ? savedProjectItems : mockProjects}
        onProjectClick={(project) => openLatestProject(project)}
        onRenameProject={hasSavedProjects ? renameProject : undefined}
        onDeleteProject={hasSavedProjects ? deleteProject : undefined}
      />
    );
  }, [activeTab, hasSavedProjects, homeContent, savedProjectItems]);

  return (
    <div style={rootStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div
        ref={scrollContainerRef}
        style={scrollAreaStyle}
        onScroll={handleScroll}
        className="app-scroll"
      >
        <main
          style={{
            ...mainStyle,
            opacity: tabContentVisible ? 1 : 0,
            transition: "opacity 140ms ease",
            willChange: "opacity",
          }}
        >
          {content}
        </main>
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={setActiveTab}
      />

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
        onGridWidthChange={(value) =>
          setGridWidth(sanitizeNumericInput(value))
        }
        onGridHeightChange={(value) =>
          setGridHeight(sanitizeNumericInput(value))
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

const rootStyle: React.CSSProperties = {
  ...ui.page,
  position: "relative",
  width: "100%",
  height: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  minHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  maxHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
  overflow: "hidden",
};

const scrollAreaStyle: React.CSSProperties = {
  ...ui.contentWrapper,
  position: "relative",
  zIndex: 2,
  height: "100%",
  background: "transparent",
  paddingTop: 0,
  paddingBottom: TAB_BAR_SAFE_SPACE,
  boxSizing: "border-box",
  overflowY: "auto",
  overflowX: "hidden",
};

const topGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -100,
  left: -90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: ds.color.glowBlue,
  filter: "blur(90px)",
  zIndex: 0,
  pointerEvents: "none",
};

const sideGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: 60,
  right: -90,
  width: 280,
  height: 280,
  borderRadius: "50%",
  background: ds.color.glowPurple,
  filter: "blur(90px)",
  zIndex: 0,
  pointerEvents: "none",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 22,
  paddingTop: `calc(env(safe-area-inset-top, 0px) + ${HOME_TOP_CONTROLS_SPACE}px)`,
  paddingBottom: 8,
};

const stickyHeroWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: `calc(env(safe-area-inset-top, 0px) + ${HOME_TOP_CONTROLS_SPACE}px)`,
  zIndex: 20,
  background: "transparent",
  paddingTop: 18,
  paddingBottom: 20,
  willChange: "padding",
};

const heroTextWrapStyle: React.CSSProperties = {
  overflow: "hidden",
  transformOrigin: "top left",
  willChange: "transform, opacity, max-height, margin",
  maxHeight: 132,
  marginBottom: 18,
};

const heroButtonsStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const appTitleStyle: React.CSSProperties = {
  fontSize: ds.font.heroApp,
  fontWeight: ds.weight.heavy,
  color: ds.color.textPrimary,
  letterSpacing: "-0.04em",
  marginBottom: 8,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: ds.color.textSecondary,
  fontSize: ds.font.heroTitle,
  lineHeight: 1.2,
  fontWeight: ds.weight.semibold,
  letterSpacing: "-0.03em",
  maxWidth: 520,
};

const primaryButtonStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 76,
  padding: "18px 22px",
  borderRadius: ds.radius.hero,
  fontSize: ds.font.buttonHero,
  textAlign: "center",
  willChange: "transform, border-radius, min-height, font-size, box-shadow",
  backfaceVisibility: "hidden",
};

const secondaryHeroButtonStyle: React.CSSProperties = {
  ...ui.secondaryButton,
  width: "100%",
  minHeight: 76,
  padding: "18px 22px",
  borderRadius: ds.radius.hero,
  fontSize: ds.font.buttonHero,
  textAlign: "center",
  willChange: "transform, border-radius, min-height, font-size, box-shadow",
  backfaceVisibility: "hidden",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const sectionHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const ghostButtonStyle: React.CSSProperties = {
  ...ui.secondaryButton,
  padding: "10px 14px",
  borderRadius: ds.radius.md,
  fontSize: ds.font.bodyMd,
  boxShadow: "none",
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
};

export default HomeScreen;