import React, { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  onCreateGrid: () => void;
}

type HomeTab = "home" | "templates" | "projects";

type ProjectItem = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
};

const mockProjects: ProjectItem[] = [
  {
    id: "1",
    title: "Новый проект",
    subtitle: "9×10 • 2 мм",
    updatedAt: "Сегодня",
  },
  {
    id: "2",
    title: "Брелок сердце",
    subtitle: "12×14 • 2 мм",
    updatedAt: "Сегодня",
  },
  {
    id: "3",
    title: "Цветок",
    subtitle: "10×12 • 2 мм",
    updatedAt: "Сегодня",
  },
  {
    id: "4",
    title: "Клубника",
    subtitle: "14×16 • 2 мм",
    updatedAt: "Вчера",
  },
  {
    id: "5",
    title: "Смайлик",
    subtitle: "8×8 • 2 мм",
    updatedAt: "Вчера",
  },
  {
    id: "6",
    title: "Мишка",
    subtitle: "16×18 • 2 мм",
    updatedAt: "2 дня назад",
  },
  {
    id: "7",
    title: "Котик",
    subtitle: "13×15 • 2 мм",
    updatedAt: "2 дня назад",
  },
  {
    id: "8",
    title: "Звезда",
    subtitle: "11×11 • 2 мм",
    updatedAt: "3 дня назад",
  },
  {
    id: "9",
    title: "Молния",
    subtitle: "10×13 • 2 мм",
    updatedAt: "3 дня назад",
  },
  {
    id: "10",
    title: "Череп",
    subtitle: "15×17 • 2 мм",
    updatedAt: "Неделю назад",
  },
];

const COLLAPSE_SCROLL = 72;
const SWIPE_THRESHOLD = 44;
const SHEET_CLOSE_THRESHOLD = 96;

const tabOrder: HomeTab[] = ["home", "templates", "projects"];

const HomeScreen: React.FC<Props> = ({ onCreateGrid }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("home");

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [projectName, setProjectName] = useState("Новый проект");
  const [gridWidth, setGridWidth] = useState("9");
  const [gridHeight, setGridHeight] = useState("10");

  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const textWrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestScrollRef = useRef(0);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const handleRef = useRef<HTMLDivElement | null>(null);
  const draggingSheetRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragPointerIdRef = useRef<number | null>(null);

  const hasProjects = mockProjects.length > 0;
  const latestProjects = mockProjects.slice(0, 10);

  const openCreateSheet = () => {
    setSheetDragY(0);
    setSheetDragging(false);
    setCreateSheetOpen(true);
  };

  const closeCreateSheet = () => {
    setSheetDragY(0);
    setSheetDragging(false);
    setCreateSheetOpen(false);
    draggingSheetRef.current = false;
    dragPointerIdRef.current = null;
  };

  const handleCreateGrid = () => {
    onCreateGrid();
    closeCreateSheet();
  };

  const applyHeroAnimation = (scrollTop: number) => {
    const sticky = stickyRef.current;
    const textWrap = textWrapRef.current;
    const button = buttonRef.current;

    if (!sticky || !textWrap || !button) return;

    const progress = Math.min(Math.max(scrollTop / COLLAPSE_SCROLL, 0), 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const paddingTop = 18 - 6 * eased;
    const paddingBottom = 20 - 8 * eased;

    const textOpacity = 1 - eased;
    const textTranslateY = -18 * eased;
    const textScale = 1 - 0.06 * eased;
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

    button.style.minHeight = `${buttonHeight}px`;
    button.style.fontSize = `${buttonFontSize}px`;
    button.style.borderRadius = `${buttonRadius}px`;
    button.style.transform = `translateY(${buttonTranslateY}px)`;
    button.style.boxShadow = `0 ${buttonShadowY}px ${buttonShadowBlur}px rgba(0,0,0,${buttonShadowOpacity})`;
  };

  useEffect(() => {
    if (activeTab === "home") {
      applyHeroAnimation(latestScrollRef.current);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingSheetRef.current) return;
      if (dragPointerIdRef.current !== event.pointerId) return;

      const diffY = event.clientY - dragStartYRef.current;
      const nextY = diffY > 0 ? diffY : 0;

      event.preventDefault();
      setSheetDragY(nextY);
    };

    const finishDrag = (event?: PointerEvent) => {
      if (!draggingSheetRef.current) return;
      if (event && dragPointerIdRef.current !== event.pointerId) return;

      const currentY = sheetDragYRef.current;

      draggingSheetRef.current = false;
      dragPointerIdRef.current = null;
      setSheetDragging(false);

      if (currentY > SHEET_CLOSE_THRESHOLD) {
        closeCreateSheet();
      } else {
        setSheetDragY(0);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

  const sheetDragYRef = useRef(0);

  useEffect(() => {
    sheetDragYRef.current = sheetDragY;
  }, [sheetDragY]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    latestScrollRef.current = event.currentTarget.scrollTop;

    if (activeTab !== "home") return;
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      applyHeroAnimation(latestScrollRef.current);
      rafRef.current = null;
    });
  };

  const switchTabByDirection = (direction: "left" | "right") => {
    const currentIndex = tabOrder.indexOf(activeTab);

    if (direction === "left") {
      const nextIndex = Math.min(currentIndex + 1, tabOrder.length - 1);
      setActiveTab(tabOrder[nextIndex]);
      return;
    }

    const prevIndex = Math.max(currentIndex - 1, 0);
    setActiveTab(tabOrder[prevIndex]);
  };

  const handleTabbarTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTabbarTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTabbarTouchEnd = () => {
    const start = touchStartRef.current;
    const end = touchCurrentRef.current;

    touchStartRef.current = null;
    touchCurrentRef.current = null;

    if (!start || !end) return;

    const diffX = end.x - start.x;
    const diffY = end.y - start.y;

    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    if (absX < SWIPE_THRESHOLD) return;
    if (absX <= absY) return;

    if (diffX < 0) {
      switchTabByDirection("left");
    } else {
      switchTabByDirection("right");
    }
  };

  const handleSheetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!createSheetOpen) return;

    draggingSheetRef.current = true;
    dragPointerIdRef.current = event.pointerId;
    dragStartYRef.current = event.clientY;
    setSheetDragging(true);
    setSheetDragY(0);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const renderProjectCard = (project: ProjectItem) => (
    <button
      key={project.id}
      style={projectCardStyle}
      onClick={onCreateGrid}
      type="button"
    >
      <div style={projectIconStyle}>✦</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={projectTitleStyle}>{project.title}</div>
        <div style={projectSubtitleStyle}>{project.subtitle}</div>
      </div>

      <div style={projectDateStyle}>{project.updatedAt}</div>
    </button>
  );

  const homeContent = (
    <>
      <section ref={stickyRef} style={stickyHeroWrapStyle}>
        <div ref={textWrapRef} style={heroTextWrapStyle}>
          <div style={appTitleStyle}>Beadly</div>
          <h1 style={heroTitleStyle}>Создавай схемы быстро и красиво</h1>
        </div>

        <button
          ref={buttonRef}
          onClick={openCreateSheet}
          style={primaryButtonStyle}
          type="button"
        >
          + Создать сетку
        </button>
      </section>

      {hasProjects && (
        <section style={sectionStyle}>
          <div style={sectionHeaderRowStyle}>
            <h2 style={sectionTitleStyle}>Последние проекты</h2>

            <button
              style={ghostButtonStyle}
              onClick={() => setActiveTab("projects")}
              type="button"
            >
              Все
            </button>
          </div>

          <div style={projectsListStyle}>
            {latestProjects.map(renderProjectCard)}
          </div>
        </section>
      )}
    </>
  );

  const templatesContent = (
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={secondaryHeroTitleStyle}>Шаблоны</h1>
        </div>
      </section>

      <section style={templatesSectionStyle}>
        <div style={templatesCardStyle}>
          <div style={emptyIconStyle}>◻︎</div>
          <p style={emptyTextStyle}>
            Пока здесь будет одна ячейка с текстом, как ты и хотел. Позже сюда
            можно добавить реальные карточки шаблонов.
          </p>
        </div>
      </section>
    </>
  );

  const projectsContent = (
    <>
      <section style={secondaryHeroWrapStyle}>
        <div style={secondaryHeroTextWrapStyle}>
          <h1 style={secondaryHeroTitleStyle}>Проекты</h1>
        </div>
      </section>

      <section style={projectsSectionStyle}>
        {hasProjects ? (
          <div style={projectsListStyle}>{mockProjects.map(renderProjectCard)}</div>
        ) : (
          <section style={emptyStateStyle}>
            <div style={emptyIconStyle}>📁</div>
            <h2 style={emptyTitleStyle}>Пока нет проектов</h2>
            <p style={emptyTextStyle}>Создай первую сетку и она появится здесь.</p>
          </section>
        )}
      </section>
    </>
  );

  const content = useMemo(() => {
    if (activeTab === "home") return homeContent;
    if (activeTab === "templates") return templatesContent;
    return projectsContent;
  }, [activeTab]);

  const renderCreateSheet = () => {
    const translateY = createSheetOpen ? sheetDragY : 1050;
    const overlayOpacity = createSheetOpen
      ? Math.max(0, 0.42 - sheetDragY / 260)
      : 0;

    return (
      <>
        <div
          onClick={closeCreateSheet}
          style={{
            position: "fixed",
            inset: 0,
            background: `rgba(0,0,0,${overlayOpacity})`,
            pointerEvents: createSheetOpen ? "auto" : "none",
            transition: sheetDragging ? "none" : "background 0.24s ease",
            zIndex: 120,
          }}
        />

        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 130,
            transform: `translateY(${translateY}px)`,
            transition: sheetDragging ? "none" : "transform 0.26s ease",
            padding: "0 10px max(10px, env(safe-area-inset-bottom))",
            pointerEvents: createSheetOpen ? "auto" : "none",
          }}
        >
          <div
            style={{
              maxWidth: 560,
              margin: "0 auto",
              borderRadius: 30,
              overflow: "hidden",
              background: "#1b1d22",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 -20px 50px rgba(0,0,0,0.34)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              ref={handleRef}
              onPointerDown={handleSheetPointerDown}
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 10,
                paddingBottom: 8,
                flexShrink: 0,
                touchAction: "none",
                cursor: "grab",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.18)",
                }}
              />
            </div>

            <div
              style={{
                padding: "0 16px 14px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <div style={sheetHeaderTitleStyle}>Новый проект</div>
            </div>

            <div
              style={{
                padding: "0 16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={sheetStackStyle}>
                <div style={sheetLabelStyle}>Имя проекта</div>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Введите имя проекта"
                  style={sheetInputStyle}
                />
              </div>

              <div style={sheetFieldsRowStyle}>
                <div style={sheetStackStyle}>
                  <div style={sheetLabelStyle}>Ширина</div>
                  <input
                    value={gridWidth}
                    onChange={(e) => setGridWidth(e.target.value)}
                    inputMode="numeric"
                    placeholder="9"
                    style={sheetInputStyle}
                  />
                  <div style={sheetHintStyle}>по крестикам</div>
                </div>

                <div style={sheetStackStyle}>
                  <div style={sheetLabelStyle}>Длина</div>
                  <input
                    value={gridHeight}
                    onChange={(e) => setGridHeight(e.target.value)}
                    inputMode="numeric"
                    placeholder="10"
                    style={sheetInputStyle}
                  />
                  <div style={sheetHintStyle}>по крестикам</div>
                </div>
              </div>

              <button
                onClick={handleCreateGrid}
                style={sheetCreateButtonStyle}
                type="button"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={pageStyle}>
      <div style={topGlowStyle} />
      <div style={sideGlowStyle} />

      <div
        ref={scrollContainerRef}
        style={contentWrapperStyle}
        onScroll={handleScroll}
      >
        <main style={mainStyle}>{content}</main>
      </div>

      <div style={tabbarWrapStyle}>
        <div
          style={tabbarStyle}
          onTouchStart={handleTabbarTouchStart}
          onTouchMove={handleTabbarTouchMove}
          onTouchEnd={handleTabbarTouchEnd}
        >
          <TabBarButton
            active={activeTab === "home"}
            icon="🏠"
            label="Главная"
            onClick={() => setActiveTab("home")}
          />

          <TabBarButton
            active={activeTab === "templates"}
            icon="✦"
            label="Шаблоны"
            onClick={() => setActiveTab("templates")}
          />

          <TabBarButton
            active={activeTab === "projects"}
            icon="📁"
            label="Проекты"
            onClick={() => setActiveTab("projects")}
          />
        </div>
      </div>

      {renderCreateSheet()}
    </div>
  );
};

interface TabBarButtonProps {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}

const TabBarButton: React.FC<TabBarButtonProps> = ({
  active,
  icon,
  label,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        ...tabButtonStyle,
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        border: active
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid transparent",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span
        style={{
          fontSize: 11,
          color: active ? "#ffffff" : "rgba(255,255,255,0.64)",
          fontWeight: active ? 700 : 500,
        }}
      >
        {label}
      </span>
    </button>
  );
};

const pageStyle: React.CSSProperties = {
  width: "100%",
  position: "fixed",
  inset: 0,
  height:
    "var(--tg-viewport-stable-height, var(--tg-stable-height-fallback, var(--app-height, 100vh)))",
  minHeight:
    "var(--tg-viewport-stable-height, var(--tg-stable-height-fallback, var(--app-height, 100vh)))",
  background:
    "radial-gradient(circle at top left, rgba(96,132,255,0.16), transparent 26%), radial-gradient(circle at top right, rgba(129,92,255,0.12), transparent 24%), linear-gradient(180deg, #121318 0%, #0c0e12 100%)",
  overflow: "hidden",
  overscrollBehavior: "none",
};

const topGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -100,
  left: -90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(65, 125, 255, 0.16)",
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
  background: "rgba(167, 94, 255, 0.14)",
  filter: "blur(90px)",
  zIndex: 0,
  pointerEvents: "none",
};

const contentWrapperStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  maxWidth: 860,
  margin: "0 auto",
  padding: "0 18px 120px",
  boxSizing: "border-box",
  height:
    "var(--tg-viewport-stable-height, var(--tg-stable-height-fallback, var(--app-height, 100vh)))",
  minHeight:
    "var(--tg-viewport-stable-height, var(--tg-stable-height-fallback, var(--app-height, 100vh)))",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 22,
};

const stickyHeroWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
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

const appTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 900,
  color: "#fff",
  letterSpacing: "-0.04em",
  marginBottom: 8,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.82)",
  fontSize: 20,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: "-0.03em",
  maxWidth: 520,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 76,
  padding: "18px 22px",
  borderRadius: 24,
  border: "none",
  background: "#ffffff",
  color: "#0c0e12",
  fontWeight: 900,
  fontSize: 20,
  cursor: "pointer",
  textAlign: "center",
  boxShadow: "0 16px 34px rgba(0,0,0,0.26)",
  willChange: "transform, border-radius, min-height, font-size, box-shadow",
  backfaceVisibility: "hidden",
};

const secondaryHeroWrapStyle: React.CSSProperties = {
  paddingTop: 22,
  paddingBottom: 10,
};

const secondaryHeroTextWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingLeft: 2,
};

const secondaryHeroTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 800,
  letterSpacing: "-0.04em",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const templatesSectionStyle: React.CSSProperties = {
  paddingTop: 2,
};

const projectsSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 2,
};

const sectionHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.03em",
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  boxShadow: "none",
};

const projectsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
};

const projectCardStyle: React.CSSProperties = {
  width: "100%",
  padding: 16,
  borderRadius: 22,
  background: "rgba(28, 30, 36, 0.7)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
  display: "flex",
  alignItems: "center",
  gap: 14,
  cursor: "pointer",
  textAlign: "left",
};

const projectIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#fff",
  fontSize: 20,
  flexShrink: 0,
};

const projectTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 4,
};

const projectSubtitleStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
};

const projectDateStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: 12,
  flexShrink: 0,
};

const templatesCardStyle: React.CSSProperties = {
  minHeight: "46vh",
  borderRadius: 28,
  background: "rgba(28, 30, 36, 0.66)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: "28px 24px",
  textAlign: "center",
  marginTop: 6,
};

const emptyStateStyle: React.CSSProperties = {
  minHeight: "56vh",
  borderRadius: 28,
  background: "rgba(28, 30, 36, 0.66)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: 24,
  textAlign: "center",
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 14,
};

const emptyTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 22,
  fontWeight: 800,
};

const emptyTextStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "rgba(255,255,255,0.62)",
  fontSize: 14,
  lineHeight: 1.5,
  maxWidth: 320,
};

const tabbarWrapStyle: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  padding: "0 14px calc(12px + env(safe-area-inset-bottom))",
  pointerEvents: "none",
};

const tabbarStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  padding: 10,
  borderRadius: 28,
  background: "rgba(28, 30, 36, 0.9)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(24px)",
  boxShadow: "0 -10px 30px rgba(0,0,0,0.24)",
  pointerEvents: "auto",
  touchAction: "pan-y",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const tabButtonStyle: React.CSSProperties = {
  minHeight: 62,
  borderRadius: 20,
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  cursor: "pointer",
  boxShadow: "none",
  border: "none",
};

const sheetHeaderTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 17,
  fontWeight: 700,
};

const sheetStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sheetFieldsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const sheetLabelStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
};

const sheetHintStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.52)",
  fontSize: 12,
  lineHeight: 1.2,
};

const sheetInputStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#2a2d33",
  color: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontSize: 17,
};

const sheetCreateButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: 20,
  border: "none",
  background: "#ffffff",
  color: "#0c0e12",
  fontWeight: 900,
  fontSize: 17,
  cursor: "pointer",
  boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
  marginTop: 4,
};

export default HomeScreen;