/**
 * Telegram Mini App viewport adapter.
 *
 * Важно: официальные CSS-переменные Telegram `--tg-safe-area-inset-*` и
 * `--tg-content-safe-area-inset-*` здесь НЕ перезаписываем. Мы только читаем их
 * и создаём свои alias-переменные `--app-tg-*`, чтобы контент и sheet не
 * залезали под системный UI Telegram.
 */

type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramViewportChangedPayload = {
  isStateStable?: boolean;
};

type TelegramWebAppEvent =
  | "viewportChanged"
  | "safeAreaChanged"
  | "contentSafeAreaChanged"
  | "fullscreenChanged";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  isVersionAtLeast?: (version: string) => boolean;

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;
  isVerticalSwipesEnabled?: boolean;
  isFullscreen?: boolean;

  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;

  onEvent?: (
    eventType: TelegramWebAppEvent,
    eventHandler: (event?: TelegramViewportChangedPayload) => void,
  ) => void;
  offEvent?: (
    eventType: TelegramWebAppEvent,
    eventHandler: (event?: TelegramViewportChangedPayload) => void,
  ) => void;
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

const SCREEN_EXTRA_GAP = 16;
const SHEET_EXTRA_GAP = 8;

let fullscreenRequested = false;

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
    // Часть клиентов даёт только официальный WebApp API.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Telegram Web может запретить postMessage — это не критично.
  }
};

const getRoot = () => {
  if (typeof document === "undefined") return null;

  return document.documentElement;
};

const parsePx = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  if (typeof value !== "string") return 0;

  const parsed = Number.parseFloat(value.replace("px", "").trim());

  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const readCssPx = (variableName: string) => {
  const root = getRoot();
  if (!root || typeof window === "undefined") return 0;

  return parsePx(window.getComputedStyle(root).getPropertyValue(variableName));
};

const readTelegramInset = (
  tg: TelegramWebApp | undefined,
  source: "safeAreaInset" | "contentSafeAreaInset",
  side: keyof TelegramInset,
) => {
  return parsePx(tg?.[source]?.[side]);
};

const readInset = (
  tg: TelegramWebApp | undefined,
  cssVariableName: string,
  source: "safeAreaInset" | "contentSafeAreaInset",
  side: keyof TelegramInset,
) => {
  const cssValue = readCssPx(cssVariableName);
  const apiValue = readTelegramInset(tg, source, side);

  // Telegram может отдать значение либо через CSS var, либо через объект WebApp.
  return Math.max(cssValue, apiValue);
};

const getViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return Math.round(
    tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight,
  );
};

const getStableViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return Math.round(
    tg?.viewportStableHeight ?? window.visualViewport?.height ?? window.innerHeight,
  );
};

const setPx = (name: string, value: number) => {
  const root = getRoot();
  if (!root) return;

  root.style.setProperty(name, `${Math.max(0, Math.round(value))}px`);
};

const updateTelegramViewportVars = () => {
  const root = getRoot();
  if (!root) return;

  const tg = getTelegramWebApp();

  const viewportHeight = getViewportHeight(tg);
  const stableHeight = getStableViewportHeight(tg);
  const appHeight = Math.max(viewportHeight, stableHeight, window.innerHeight || 0);

  const safeTop = readInset(tg, "--tg-safe-area-inset-top", "safeAreaInset", "top");
  const safeRight = readInset(tg, "--tg-safe-area-inset-right", "safeAreaInset", "right");
  const safeBottom = readInset(tg, "--tg-safe-area-inset-bottom", "safeAreaInset", "bottom");
  const safeLeft = readInset(tg, "--tg-safe-area-inset-left", "safeAreaInset", "left");

  const contentTop = readInset(
    tg,
    "--tg-content-safe-area-inset-top",
    "contentSafeAreaInset",
    "top",
  );
  const contentRight = readInset(
    tg,
    "--tg-content-safe-area-inset-right",
    "contentSafeAreaInset",
    "right",
  );
  const contentBottom = readInset(
    tg,
    "--tg-content-safe-area-inset-bottom",
    "contentSafeAreaInset",
    "bottom",
  );
  const contentLeft = readInset(
    tg,
    "--tg-content-safe-area-inset-left",
    "contentSafeAreaInset",
    "left",
  );

  const safeTopTotal = safeTop + contentTop;
  const safeBottomTotal = safeBottom + contentBottom;
  const safeLeftTotal = safeLeft + contentLeft;
  const safeRightTotal = safeRight + contentRight;

  const screenTopOffset = safeTopTotal > 0 ? safeTopTotal + SCREEN_EXTRA_GAP : 0;
  const sheetTopLimit = safeTopTotal > 0 ? safeTopTotal + SHEET_EXTRA_GAP : 0;

  setPx("--app-height", appHeight || viewportHeight || stableHeight);
  setPx("--tg-viewport-height", viewportHeight);
  setPx("--tg-viewport-stable-height", stableHeight || appHeight || viewportHeight);

  setPx("--app-tg-safe-area-inset-top", safeTop);
  setPx("--app-tg-safe-area-inset-right", safeRight);
  setPx("--app-tg-safe-area-inset-bottom", safeBottom);
  setPx("--app-tg-safe-area-inset-left", safeLeft);

  setPx("--app-tg-content-safe-area-inset-top", contentTop);
  setPx("--app-tg-content-safe-area-inset-right", contentRight);
  setPx("--app-tg-content-safe-area-inset-bottom", contentBottom);
  setPx("--app-tg-content-safe-area-inset-left", contentLeft);

  setPx("--app-tg-safe-top", safeTopTotal);
  setPx("--app-tg-safe-right", safeRightTotal);
  setPx("--app-tg-safe-bottom", safeBottomTotal);
  setPx("--app-tg-safe-left", safeLeftTotal);

  setPx("--app-tg-screen-top-offset", screenTopOffset);
  setPx("--app-tg-sheet-top-limit", sheetTopLimit);

  // Старые алиасы оставляем только для обратной совместимости компонентов.
  setPx("--tg-safe-top", safeTopTotal);
  setPx("--tg-safe-bottom", safeBottomTotal);
  setPx("--tg-top-navigation-space", screenTopOffset);

  root.dataset.tgSafeTop = String(Math.round(safeTop));
  root.dataset.tgContentSafeTop = String(Math.round(contentTop));
  root.dataset.tgScreenTopOffset = String(Math.round(screenTopOffset));
  root.dataset.tgSheetTopLimit = String(Math.round(sheetTopLimit));
  root.classList.add("tg-swipe-lock");
  root.classList.toggle("tg-fullscreen", tg?.isFullscreen === true);
};

const disableTelegramVerticalSwipe = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.disableVerticalSwipes?.();
  } catch {
    // Не все клиенты поддерживают метод.
  }

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });
};

const requestFullscreenOnce = () => {
  const tg = getTelegramWebApp();
  if (!tg?.requestFullscreen || fullscreenRequested) return;

  try {
    tg.requestFullscreen();
    fullscreenRequested = true;
  } catch {
    // Fullscreen поддерживается не на всех клиентах.
  }
};

/** Отключает нативный вертикальный свайп Telegram и обновляет CSS-переменные. */
export const lockTelegramSwipeBehavior = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {
    // Telegram bridge может быть ещё не готов на первом тике.
  }

  disableTelegramVerticalSwipe();
  requestFullscreenOnce();
  updateTelegramViewportVars();
};

/** Мгновенный запуск до первого React-render. */
export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  window.requestAnimationFrame?.(() => {
    lockTelegramSwipeBehavior();
  });
};

/** Инициализирует отслеживание viewport/safe-area Telegram. */
export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const tg = getTelegramWebApp();
  const retryTimers = [50, 250, 700, 1500].map((delay) => {
    return window.setTimeout(() => {
      lockTelegramSwipeBehavior();
    }, delay);
  });

  const handleViewportUpdate = () => {
    // На resize клавиатуры не вызываем requestFullscreen/expand повторно — только обновляем vars.
    updateTelegramViewportVars();
    disableTelegramVerticalSwipe();
  };

  const handleSafeAreaUpdate = () => {
    updateTelegramViewportVars();
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  tg?.onEvent?.("safeAreaChanged", handleSafeAreaUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleSafeAreaUpdate);
  tg?.onEvent?.("fullscreenChanged", handleSafeAreaUpdate);

  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleViewportUpdate);
  document.addEventListener("visibilitychange", handleViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    tg?.offEvent?.("safeAreaChanged", handleSafeAreaUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleSafeAreaUpdate);
    tg?.offEvent?.("fullscreenChanged", handleSafeAreaUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleViewportUpdate);
    document.removeEventListener("visibilitychange", handleViewportUpdate);
    document.documentElement.classList.remove("tg-fullscreen");
  };
};
