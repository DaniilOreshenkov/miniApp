/**
 * Telegram viewport adapter.
 *
 * Отвечает только за:
 * 1. Инициализацию Telegram WebApp (ready, expand, fullscreen, swipe-lock).
 * 2. Отслеживание высоты viewport и сдвига клавиатуры.
 * 3. Вычисление safe-bottom и sheet-top-limit через JS (так как CSS max() не
 *    читается из getComputedStyle как число).
 *
 * Safe-top берётся напрямую из официальной CSS-переменной Telegram
 * --tg-content-safe-area-inset-top (и её алиасов в index.css).
 * Никаких fallback-значений и платформ-детекции.
 */

type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramWebAppEvent =
  | "viewportChanged"
  | "safeAreaChanged"
  | "contentSafeAreaChanged"
  | "fullscreenChanged"
  | "fullscreenFailed";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;
  isFullscreen?: boolean;
  isVerticalSwipesEnabled?: boolean;

  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;

  onEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
  offEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
};

type TelegramWebviewProxy = {
  postEvent?: (eventType: string, eventData: string) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
  TelegramWebviewProxy?: TelegramWebviewProxy;
};

/** Минимальный зазор от верха экрана до листа (sheet). */
const SHEET_TOP_GAP = 8;
/** Минимальный зазор снизу (tabbar). */
const TABBAR_BOTTOM_GAP = 10;
/** Минимальный зазор sheet снизу. */
const SHEET_BOTTOM_GAP = 16;
/** Порог обнаружения открытой клавиатуры (px). */
const KEYBOARD_DETECTION_GAP = 72;

let fullscreenRequested = false;
let stableViewportHeight = 0;
let viewportRafId: number | null = null;

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
};

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown>) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // ignore
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // ignore
  }
};

const requestTelegramSafeAreas = () => {
  postTelegramWebEvent("web_app_request_safe_area", {});
  postTelegramWebEvent("web_app_request_content_safe_area", {});
};

const normalizePx = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

const readCssPx = (name: string): number => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return 0;
  return normalizePx(raw.replace("px", ""));
};

const setPxVar = (root: HTMLElement, name: string, value: number) => {
  root.style.setProperty(name, `${normalizePx(value)}px`);
};

const prepareTelegramWebApp = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    // Telegram bridge может быть ещё не готов.
  }

  if (tg && !fullscreenRequested) {
    fullscreenRequested = true;
    try {
      tg.requestFullscreen?.();
    } catch {
      // Не на всех клиентах поддерживается.
    }
  }

  return tg;
};

const getViewportHeight = (tg: TelegramWebApp | undefined): number => {
  if (typeof window === "undefined") return 0;
  return normalizePx(tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight);
};

const getPotentialStableHeight = (tg: TelegramWebApp | undefined): number => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return normalizePx(
    Math.max(
      tg?.viewportStableHeight ?? 0,
      window.innerHeight ?? 0,
      document.documentElement.clientHeight ?? 0,
      window.visualViewport?.height ?? 0,
      tg?.viewportHeight ?? 0,
    ),
  );
};

const getVisualBottom = (): number => {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return normalizePx(window.innerHeight);
  return normalizePx(vv.offsetTop + vv.height);
};

const getKeyboardMetrics = (tg: TelegramWebApp | undefined) => {
  const viewportHeight = getViewportHeight(tg);
  const potentialStableHeight = getPotentialStableHeight(tg);

  if (stableViewportHeight <= 0) {
    stableViewportHeight = Math.max(potentialStableHeight, viewportHeight, 1);
  }

  const visualBottom = getVisualBottom();
  const keyboardOffset = normalizePx(
    Math.max(0, stableViewportHeight - visualBottom, stableViewportHeight - viewportHeight),
  );
  const isKeyboardOpen = keyboardOffset > KEYBOARD_DETECTION_GAP;

  if (!isKeyboardOpen && potentialStableHeight > stableViewportHeight) {
    stableViewportHeight = potentialStableHeight;
  }

  return {
    viewportHeight,
    stableHeight: Math.max(stableViewportHeight, viewportHeight, 1),
    keyboardOffset,
    isKeyboardOpen,
  };
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewport = getKeyboardMetrics(tg);

  // ── Высота viewport ────────────────────────────────────────────────────────
  const sheetIsOpen = root.classList.contains("tg-sheet-open");
  const stableAppHeight = Math.max(stableViewportHeight, viewport.stableHeight, 1);

  setPxVar(root, "--app-height", sheetIsOpen ? stableAppHeight : viewport.stableHeight);
  setPxVar(root, "--tg-viewport-height", viewport.viewportHeight);
  setPxVar(root, "--tg-viewport-stable-height", stableAppHeight);
  setPxVar(root, "--tg-keyboard-offset", viewport.keyboardOffset);
  setPxVar(root, "--sheet-keyboard-offset", viewport.keyboardOffset);
  setPxVar(root, "--app-keyboard-offset", viewport.keyboardOffset);

  // ── Safe-bottom: берём максимум из всех источников ──────────────────────
  // CSS-переменные Telegram уже содержат актуальные значения,
  // API-поля используем как дополнительный источник.
  const contentBottom = Math.max(
    readCssPx("--tg-content-safe-area-inset-bottom"),
    normalizePx(tg?.contentSafeAreaInset?.bottom),
  );
  const safeBottom = Math.max(
    readCssPx("--tg-safe-area-inset-bottom"),
    normalizePx(tg?.safeAreaInset?.bottom),
    contentBottom,
  );

  // ── Safe-top: сумма iOS safe-area + Telegram content safe-area ──────────
  // JS перезаписывает --app-safe-top (CSS calc() — fallback),
  // и вычисляет sheet-top-limit для useKeyboardAwareSheet.
  const contentSafeTop = Math.max(
    readCssPx("--tg-content-safe-area-inset-top"),
    normalizePx(tg?.contentSafeAreaInset?.top),
  );
  const iosSafeTop = Math.max(
    readCssPx("--tg-safe-area-inset-top"),
    normalizePx(tg?.safeAreaInset?.top),
  );
  const combinedSafeTop = iosSafeTop + contentSafeTop;

  setPxVar(root, "--app-safe-top", combinedSafeTop);
  setPxVar(root, "--app-tg-safe-bottom", safeBottom);
  setPxVar(root, "--app-tg-sheet-top-limit", Math.max(SHEET_TOP_GAP, combinedSafeTop + SHEET_TOP_GAP));
  setPxVar(root, "--sheet-bottom-gap", Math.max(SHEET_BOTTOM_GAP, safeBottom + SHEET_TOP_GAP));
  setPxVar(root, "--app-tabbar-bottom-gap", Math.max(TABBAR_BOTTOM_GAP, safeBottom + TABBAR_BOTTOM_GAP));

  root.classList.add("tg-swipe-lock");
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);

  window.dispatchEvent(new CustomEvent("app:telegram-viewport-change"));
};

const scheduleViewportUpdate = () => {
  if (typeof window === "undefined") return;

  if (viewportRafId !== null) {
    window.cancelAnimationFrame(viewportRafId);
  }

  viewportRafId = window.requestAnimationFrame(() => {
    viewportRafId = null;
    prepareTelegramWebApp();
    requestTelegramSafeAreas();
    updateTelegramViewportVars();
  });
};

/** Отключает нативный вертикальный свайп Telegram и обновляет viewport-переменные. */
export const lockTelegramSwipeBehavior = () => {
  prepareTelegramWebApp();

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });

  requestTelegramSafeAreas();
  updateTelegramViewportVars();
};

/** Мгновенный запуск до первого React-render. */
export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const retryDelays = [0, 50, 150, 350, 700, 1200];
  retryDelays.forEach((delay) => {
    window.setTimeout(scheduleViewportUpdate, delay);
  });
};

/** Инициализирует отслеживание viewport Telegram и возвращает функцию очистки. */
export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const tg = getTelegramWebApp();
  const retryTimers = [50, 150, 350, 700, 1200, 2000].map((delay) => {
    return window.setTimeout(scheduleViewportUpdate, delay);
  });

  const handleViewportUpdate = () => {
    scheduleViewportUpdate();
  };

  const handleOrientationChange = () => {
    stableViewportHeight = 0;
    scheduleViewportUpdate();
    window.setTimeout(scheduleViewportUpdate, 260);
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  tg?.onEvent?.("safeAreaChanged", handleViewportUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleViewportUpdate);
  tg?.onEvent?.("fullscreenChanged", handleViewportUpdate);
  tg?.onEvent?.("fullscreenFailed", handleViewportUpdate);
  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.visualViewport?.addEventListener("scroll", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleOrientationChange);
  document.addEventListener("visibilitychange", handleViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));

    if (viewportRafId !== null) {
      window.cancelAnimationFrame(viewportRafId);
      viewportRafId = null;
    }

    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    tg?.offEvent?.("safeAreaChanged", handleViewportUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleViewportUpdate);
    tg?.offEvent?.("fullscreenChanged", handleViewportUpdate);
    tg?.offEvent?.("fullscreenFailed", handleViewportUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.visualViewport?.removeEventListener("scroll", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleOrientationChange);
    document.removeEventListener("visibilitychange", handleViewportUpdate);
    document.documentElement.classList.remove("tg-keyboard-open");
  };
};

/**
 * Красит системную область Telegram (хедер + фон + нижняя панель) в цвет нашего приложения.
 * Это делает зону выше contentSafeAreaInset.top визуально частью приложения —
 * системные кнопки TG отображаются поверх нашего фона, а не на дефолтном.
 */
export const setTelegramAppColor = (color: string) => {
  const tg = getTelegramWebApp();
  if (!tg) return;

  try {
    tg.setHeaderColor?.(color);
  } catch {
    // Не поддерживается на старых клиентах.
  }

  try {
    tg.setBackgroundColor?.(color);
  } catch {
    // Не поддерживается на старых клиентах.
  }

  try {
    tg.setBottomBarColor?.(color);
  } catch {
    // Не поддерживается на старых клиентах.
  }
};
