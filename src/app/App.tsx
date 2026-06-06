/**
 * Корневой контейнер приложения.
 *
 * Зона ответственности:
 * - хранит глобальное состояние: текущий экран, проекты, активный проект, тему;
 * - подключает жизненный цикл Telegram/WebView;
 * - передаёт данные в экраны и принимает действия пользователя через callbacks;
 * - показывает единый кастомный AppAlert вместо системных prompt/confirm.
 */

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import HomeScreen from "../screens/HomeScreen";
// Тяжёлые экраны грузятся лениво — не блокируют первый рендер HomeScreen.
// GridScreen содержит CanvasGrid (136KB), грузить его сразу не нужно.
const GridScreen         = lazy(() => import("../screens/GridScreen"));
const ImportImageScreen  = lazy(() => import("../screens/ImportImageScreen"));
const CreateProjectScreen = lazy(() => import("../screens/CreateProjectScreen"));
import PaywallScreen from "../screens/PaywallScreen";
import ScreenTransition from "../components/ScreenTransition";
import ScreenLoader from "../components/ScreenLoader";
import AppAlert from "../components/AppAlert";
import type { GridData, GridProject, GridSeed } from "../entities/project/types";
import {
  createProjectFromSeed,
  formatProjectUpdatedAt,
  loadProjects,
  saveProjects,
  upsertProject,
} from "../entities/project/storage";
import { getActivePlan, setActivePlan } from "../entities/subscription/plans";
import type { AppTheme } from "./theme";
import {
  applyAppTheme,
  getNextTheme,
  getStoredTheme,
  getThemeBackgroundColor,
  saveTheme,
} from "./theme";

import { initTelegramViewport, setTelegramAppColor } from "./telegramViewport";
import { initAppTouchLock } from "./touchLock";

type Screen = "home" | "grid" | "import" | "create";
type ProjectAlertState =
  | { type: "rename"; project: GridProject }
  | { type: "delete"; project: GridProject };

const PROJECTS_SAVE_DEBOUNCE_MS = 180;

const SESSION_SCREEN_KEY = "beadly-session-screen";
const SESSION_PROJECT_KEY = "beadly-session-project-id";


/** Восстанавливает экран + активный проект из sessionStorage. */
const restoreSession = (projects: GridProject[]): { screen: Screen; gridData: GridData } => {
  try {
    const savedScreen = sessionStorage.getItem(SESSION_SCREEN_KEY);
    if (savedScreen === "create") return { screen: "create", gridData: null };
    if (savedScreen === "grid") {
      const id = sessionStorage.getItem(SESSION_PROJECT_KEY);
      const project = id ? (projects.find((p) => p.id === id) ?? null) : null;
      // Если проект не нашёлся (например был удалён) — падаем на home
      if (project) return { screen: "grid", gridData: project };
    }
  } catch { /* ignore */ }
  return { screen: "home", gridData: null };
};

const App = () => {
  const [projects, setProjects] = useState<GridProject[]>(() => loadProjects());
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());

  // screen и gridData инициализируются вместе чтобы не было рассинхрона
  const sessionRef = useRef(restoreSession(loadProjects()));
  const [screen, setScreen] = useState<Screen>(() => sessionRef.current.screen);
  const [gridData, setGridData] = useState<GridData>(() => sessionRef.current.gridData);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [projectAlert, setProjectAlert] = useState<ProjectAlertState | null>(null);
  const [paywallFeature, setPaywallFeature] = useState<string | undefined>(undefined);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "checking" | "success" | "failed">("idle");
  const [activePlanId, setActivePlanId] = useState<import("../entities/subscription/plans").PlanId>(
    () => getActivePlan().id
  );
  // Для стартера: динамический лимит проектов (1 слот за каждую покупку)
  const [starterMaxProjects, setStarterMaxProjects] = useState<number>(() => {
    try { return Number(localStorage.getItem("beadly-starter-slots") ?? "1") || 1; } catch { return 1; }
  });

  const pendingGridSeedRef = useRef<import("../entities/project/types").GridSeed | null>(null);

  const isThemeSwitchingRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const projectsSaveTimeoutRef = useRef<number | null>(null);
  const latestProjectsRef = useRef<GridProject[]>(projects);
  const lastSavedProjectsJsonRef = useRef<string | null>(null);

  /** Меняет план и синхронизирует React state + localStorage */
  const applyPlan = useCallback((planId: import("../entities/subscription/plans").PlanId) => {
    const current = getActivePlan();
    setActivePlan(planId);
    setActivePlanId(planId);
    // Инкрементируем planVersion ТОЛЬКО при реальной смене плана.
    // Иначе key={planVersion} на GridScreen вызывает ненужный remount
    // при каждой фоновой проверке подписки (visibilitychange).
    if (current.id !== planId) {
      setPlanVersion((v) => v + 1);
    }
  }, []);

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

  // Сохраняем активный экран и ID проекта в sessionStorage.
  // Это позволяет восстановить состояние после перезагрузки страницы Telegram WebView.
  useEffect(() => {
    try {
      if (screen === "grid" && gridData?.id) {
        sessionStorage.setItem(SESSION_SCREEN_KEY, "grid");
        sessionStorage.setItem(SESSION_PROJECT_KEY, gridData.id);
      } else if (screen === "create") {
        sessionStorage.setItem(SESSION_SCREEN_KEY, "create");
        sessionStorage.removeItem(SESSION_PROJECT_KEY);
      } else {
        sessionStorage.removeItem(SESSION_SCREEN_KEY);
        sessionStorage.removeItem(SESSION_PROJECT_KEY);
      }
    } catch { /* ignore */ }
  }, [screen, gridData?.id]);

  // Применяем тему до отрисовки кадра, чтобы переключение не мигало и не дергало интерфейс.
  // setTelegramAppColor красит системную область TG (выше contentSafeAreaInset.top)
  // в цвет нашего фона — область системных кнопок выглядит частью приложения.
  useLayoutEffect(() => {
    applyAppTheme(theme);
    saveTheme(theme);
    setTelegramAppColor(getThemeBackgroundColor(theme));
  }, [theme]);

  // При размонтировании снимаем lock переключения темы.
  useEffect(() => {
    return () => { isThemeSwitchingRef.current = false; };
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
  // При восстановлении — переприменяем цвета Telegram-области (иначе шапка/фон TG чернеет).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushProjectsSave();
      } else {
        // Telegram WebView может сбрасывать цвета системной области при сворачивании.
        setTelegramAppColor(getThemeBackgroundColor(theme));
      }
    };

    window.addEventListener("pagehide", flushProjectsSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushProjectsSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushProjectsSave();
    };
  }, [flushProjectsSave, theme]);

  // Фоновая предзагрузка тяжёлых чанков после первого рендера HomeScreen.
  // GridScreen содержит CanvasGrid (~136KB) — грузим его заранее,
  // чтобы переход был мгновенным когда пользователь откроет проект.
  useEffect(() => {
    const id = window.setTimeout(() => {
      import("../screens/GridScreen");
      import("../screens/CreateProjectScreen");
      import("../screens/ImportImageScreen");
      import("../screens/PaywallScreen");
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);


  // Для Telegram Mini App настраиваем viewport и жесты, чтобы интерфейс вел себя как нативный.
  useEffect(() => {
    const cleanupTelegramViewport = initTelegramViewport();
    const cleanupTouchLock = initAppTouchLock();

    return () => {
      cleanupTelegramViewport();
      cleanupTouchLock();
    };
  }, []);

  // При запуске и при возврате в приложение проверяем план через Redis.
  useEffect(() => {
    const getUserId = (): string => {
      try {
        const tg = (window as Window & {
          Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } };
        }).Telegram?.WebApp;
        const id = tg?.initDataUnsafe?.user?.id;
        if (id) return String(id);
      } catch { /* ignore */ }
      let devId = localStorage.getItem("beadly-dev-uid");
      if (!devId) {
        devId = Math.random().toString(36).slice(2);
        localStorage.setItem("beadly-dev-uid", devId);
      }
      return "dev-" + devId;
    };

    const checkPlan = () => {
      const userId    = getUserId();
      const paymentId = localStorage.getItem("beadly-payment-id-v1") ?? "";
      const params    = paymentId ? `userId=${userId}&paymentId=${paymentId}` : `userId=${userId}`;
      fetch(`/api/check-plan?${params}`)
        .then((r) => r.json())
        .then((data: { planId?: string; maxProjects?: number }) => {
          if (data.planId && data.planId !== "free") {
            applyPlan(data.planId as import("../entities/subscription/plans").PlanId);
          }
          if (data.maxProjects) {
            setStarterMaxProjects(data.maxProjects);
            try { localStorage.setItem("beadly-starter-slots", String(data.maxProjects)); } catch { /* ignore */ }
          }
        })
        .catch(() => { /* ignore */ });
    };

    const checkPlanWithOverlay = () => {
      const paymentId = localStorage.getItem("beadly-payment-id-v1");
      if (!paymentId) { checkPlan(); return; }

      // Показываем оверлей только если платёж создан менее 30 минут назад
      const ts = Number(localStorage.getItem("beadly-payment-ts-v1") ?? "0");
      const age = Date.now() - ts;
      if (age > 30 * 60 * 1000) {
        localStorage.removeItem("beadly-payment-id-v1");
        localStorage.removeItem("beadly-payment-ts-v1");
        checkPlan();
        return;
      }

      // Есть paymentId — показываем спиннер и проверяем
      setPaymentStatus("checking");
      const userId = getUserId();
      fetch(`/api/check-plan?userId=${userId}&paymentId=${paymentId}`)
        .then((r) => r.json())
        .then((data: { planId?: string; paymentStatus?: string; maxProjects?: number }) => {
          if (data.maxProjects) {
            setStarterMaxProjects(data.maxProjects);
            try { localStorage.setItem("beadly-starter-slots", String(data.maxProjects)); } catch { /* ignore */ }
          }
          if (data.planId && data.planId !== "free") {
            applyPlan(data.planId as import("../entities/subscription/plans").PlanId);
            localStorage.removeItem("beadly-payment-id-v1");
            localStorage.removeItem("beadly-payment-ts-v1");
            setPaymentStatus("success");

            // Если был ожидающий seed — создаём проект и переходим в редактор после короткой паузы
            const pendingSeed = pendingGridSeedRef.current;
            if (pendingSeed) {
              pendingGridSeedRef.current = null;
              setTimeout(() => {
                const project = createProjectFromSeed(pendingSeed);
                setProjects((prev) => upsertProject(prev, project));
                setGridData(project);
                setImportFile(null);
                setPaymentStatus("idle");
                setScreen("grid");
              }, 1200);
            } else {
              setTimeout(() => setPaymentStatus("idle"), 3000);
            }
          } else if (data.paymentStatus === "canceled" || data.paymentStatus === "failed") {
            localStorage.removeItem("beadly-payment-id-v1");
            localStorage.removeItem("beadly-payment-ts-v1");
            setPaymentStatus("failed");
            setTimeout(() => setPaymentStatus("idle"), 3000);
          } else {
            // Платёж ещё в обработке — тихо скрываем
            setPaymentStatus("idle");
          }
        })
        .catch(() => setPaymentStatus("idle"));
    };

    // При запуске — тихая проверка без оверлея
    checkPlan();

    // При возврате в приложение — с оверлеем
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkPlanWithOverlay();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Создаёт проект из пользовательских/импортированных данных и сразу открывает редактор. */
  const handleCreateGrid = useCallback((seed: GridSeed) => {
    const plan = getActivePlan();

    // Для стартера: считаем сколько проектов уже создано именно на стартере
    // Для free: создавать нельзя совсем (maxProjects=0)
    // Для monthly/pro: без ограничений
    const starterUsed = latestProjectsRef.current.filter(p => p.createdWithPlan === "starter").length;
    const usedCount = plan.id === "starter" ? starterUsed : latestProjectsRef.current.length;
    const maxProjects = plan.id === "starter" ? starterMaxProjects : plan.maxProjects;

    if (usedCount >= maxProjects) {
      pendingGridSeedRef.current = seed;
      setPaywallFeature("Создание проектов");
      setPaywallOpen(true);
      return;
    }

    const project = createProjectFromSeed(seed, plan.id);

    setProjects((prev) => upsertProject(prev, project));
    setGridData(project);
    setImportFile(null);
    setScreen("grid");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterMaxProjects]);

  /** Открывает экран создания нового проекта. */
  const handleOpenCreate = useCallback(() => {
    setScreen("create");
  }, []);

  /** Закрывает экран создания и возвращает на главный экран. */
  const handleCloseCreate = useCallback(() => {
    setScreen("home");
  }, []);

  /** Открывает экран импорта изображения с выбранным файлом. */
  const handleImportFile = useCallback((file: File) => {
    setImportFile(file);
    setScreen("import");
  }, []);

  /** Закрывает экран импорта и возвращает на главный экран. */
  const handleCloseImport = useCallback(() => {
    setImportFile(null);
    setScreen("home");
  }, []);

  const handleOpenPaywall = useCallback((feature?: string) => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
  }, []);
  const handleClosePaywall = useCallback(() => setPaywallOpen(false), []);

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

  const handleThemeToggle = useCallback((originX: number, originY: number) => {
    if (isThemeSwitchingRef.current) return;
    isThemeSwitchingRef.current = true;

    const nextTheme = getNextTheme(theme);

    // ── View Transitions API (Chrome 111+, Safari 18+ — все современные TG WebView) ──
    // startViewTransition делает снапшот текущего экрана, применяет тему,
    // делает снапшот нового экрана и анимирует circular reveal через CSS.
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      document.documentElement.style.setProperty("--vt-x", `${originX}px`);
      document.documentElement.style.setProperty("--vt-y", `${originY}px`);

      const vt = (document as Document & {
        startViewTransition: (fn: () => void) => { finished: Promise<void> };
      }).startViewTransition(() => {
        // flushSync → React применяет тему синхронно + useLayoutEffect меняет data-theme
        // до того, как VT сделает снапшот нового состояния
        flushSync(() => setTheme(nextTheme));
      });

      vt.finished.finally(() => {
        isThemeSwitchingRef.current = false;
        document.documentElement.style.removeProperty("--vt-x");
        document.documentElement.style.removeProperty("--vt-y");
      });
      return;
    }

    // ── Fallback: clip-path circular reveal + fade-out ────────────────────────
    const overlay = overlayRef.current;
    const newBg = nextTheme === "light" ? "#f7f7fb" : "#0b0e14";
    const EXPAND = 400;
    const FADE   = 100;

    if (overlay) {
      overlay.style.transition   = "none";
      overlay.style.background   = newBg;
      overlay.style.opacity      = "1";
      overlay.style.clipPath     = `circle(0px at ${originX}px ${originY}px)`;
      overlay.style.transform    = "translateZ(0)";
      overlay.style.willChange   = "clip-path, opacity";

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          overlay.style.transition = `clip-path ${EXPAND}ms cubic-bezier(0.32, 0.72, 0, 1)`;
          overlay.style.clipPath   = `circle(200vmax at ${originX}px ${originY}px)`;

          window.setTimeout(() => {
            // Круг полностью закрыл экран — применяем тему
            setTheme(nextTheme);
            // Плавно убираем оверлей, показывая уже обновлённую тему
            overlay.style.transition = `opacity ${FADE}ms ease-out`;
            overlay.style.opacity    = "0";

            window.setTimeout(() => {
              overlay.style.clipPath   = "none";
              overlay.style.transform  = "";
              overlay.style.willChange = "clip-path";
              isThemeSwitchingRef.current = false;
            }, FADE + 20);
          }, EXPAND - 20);
        });
      });
    } else {
      setTheme(nextTheme);
      isThemeSwitchingRef.current = false;
    }
  }, [theme]);

  const handleBackToHome = useCallback(() => {
    setScreen("home");
  }, []);

  const isDeleteAlert = projectAlert?.type === "delete";

  // Мемоизируем screens чтобы ScreenTransition не получал новый объект на каждый рендер.
  // Без этого useEffect внутри ScreenTransition обновляет slots при любом изменении состояния
  // (например при сохранении проекта), что вызывает лишние ре-рендеры.
  const screens = useMemo(() => ({
    home: (
      <HomeScreen
        onCreateNew={handleOpenCreate}
        onCreateGrid={handleCreateGrid}
        onOpenProject={handleOpenProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onImportFile={handleImportFile}
        onOpenPaywall={handleOpenPaywall}
        activePlanId={activePlanId}
        projects={projects}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
    ),
    create: (
      <Suspense fallback={<ScreenLoader />}>
        <CreateProjectScreen
          key={planVersion}
          onClose={handleCloseCreate}
          onCreate={handleCreateGrid}
          onOpenPaywall={handleOpenPaywall}
        />
      </Suspense>
    ),
    grid: (
      <Suspense fallback={<ScreenLoader />}>
        <GridScreen
          data={gridData}
          onSave={handleSaveProject}
          onBack={handleBackToHome}
          onOpenPaywall={handleOpenPaywall}
        />
      </Suspense>
    ),
    import: (
      <Suspense fallback={<ScreenLoader />}>
        <ImportImageScreen
          file={importFile}
          theme={theme}
          onClose={handleCloseImport}
          onCreate={handleCreateGrid}
        />
      </Suspense>
    ),
  }), [
    handleOpenCreate, handleCreateGrid, handleOpenProject, handleRenameProject,
    handleDeleteProject, handleImportFile, handleOpenPaywall, projects, theme,
    handleThemeToggle, planVersion, handleCloseCreate, gridData, handleSaveProject,
    handleBackToHome, handleCloseImport, importFile, activePlanId,
  ]);

  return (
    <div className="app-shell">

      {/* Crossfade оверлей для плавного переключения темы */}
      <div ref={overlayRef} style={themeCrossfadeStyle} aria-hidden="true" />

      <ScreenTransition
        screenKey={screen}
        screens={screens}
      />

      {/* PaywallScreen — fixed overlay, не часть ScreenTransition */}
      {paywallOpen && (
        <PaywallScreen
          lockedFeature={paywallFeature}
          onClose={handleClosePaywall}
          onActivated={() => {
            const current = getActivePlan();
            setActivePlanId(current.id);
            setPlanVersion(v => v + 1);
            setPaywallOpen(false);

            // Если был ожидающий seed (пользователь пытался создать проект) — создаём и открываем редактор
            const pendingSeed = pendingGridSeedRef.current;
            if (pendingSeed) {
              pendingGridSeedRef.current = null;
              const project = createProjectFromSeed(pendingSeed);
              setProjects((prev) => upsertProject(prev, project));
              setGridData(project);
              setImportFile(null);
              setScreen("grid");
            }
          }}
        />
      )}

      {/* Оверлей проверки/подтверждения оплаты */}
      {paymentStatus !== "idle" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999999,
          background: "rgba(0,0,0,0.72)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: theme === "light" ? "#ffffff" : "#1c1f2e",
            borderRadius: 28, padding: "40px 48px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
            minWidth: 220,
          }}>
            {paymentStatus === "checking" ? (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  border: "4px solid rgba(119,86,223,0.2)",
                  borderTopColor: "#7756df",
                  animation: "spin 0.8s linear infinite",
                }} />
                <div style={{
                  fontSize: 16, fontWeight: 600,
                  color: theme === "light" ? "#1c1c1e" : "#f7f7fb",
                }}>
                  Проверяем оплату в ЮКасса…
                </div>
              </>
            ) : paymentStatus === "failed" ? (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(255,59,48,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28,
                }}>
                  ✕
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 700,
                  color: theme === "light" ? "#1c1c1e" : "#f7f7fb",
                  textAlign: "center",
                }}>
                  Платёж отменён
                </div>
                <div style={{
                  fontSize: 13,
                  color: theme === "light" ? "rgba(28,28,30,0.56)" : "rgba(247,247,251,0.56)",
                  textAlign: "center",
                }}>
                  Попробуй ещё раз
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(52,199,89,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28,
                }}>
                  ✓
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 700,
                  color: theme === "light" ? "#1c1c1e" : "#f7f7fb",
                  textAlign: "center",
                }}>
                  Оплата прошла!
                </div>
                <div style={{
                  fontSize: 13,
                  color: theme === "light" ? "rgba(28,28,30,0.56)" : "rgba(247,247,251,0.56)",
                  textAlign: "center",
                }}>
                  Подписка активирована
                </div>
              </>
            )}
          </div>
        </div>
      )}


      <AppAlert
        open={Boolean(projectAlert)}
        theme={theme}
        variant={isDeleteAlert ? "danger" : "input"}
        title={isDeleteAlert ? "Удалить проект?" : "Переименование"}
        message={
          isDeleteAlert
            ? `Проект «${projectAlert?.project.name ?? ""}» будет удалён из списка.`
            : undefined
        }
        value={projectAlert?.type === "rename" ? projectAlert.project.name : ""}
        inputLabel={projectAlert?.type === "rename" ? "Новое имя проекта" : undefined}
        placeholder="Название проекта"
        confirmText={isDeleteAlert ? "Удалить" : "Сохранить"}
        cancelText="Отмена"
        onConfirm={handleProjectAlertConfirm}
        onCancel={handleProjectAlertCancel}
      />
    </div>
  );
};

const themeCrossfadeStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99998,
  pointerEvents: "none",
  opacity: 0,
  willChange: "clip-path",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
};

export default App;
