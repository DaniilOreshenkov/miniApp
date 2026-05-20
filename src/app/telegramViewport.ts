/**
 * Telegram viewport/safe-area adapter.
 *
 * Важно: официальные CSS-переменные Telegram вида
 * --tg-safe-area-inset-* и --tg-content-safe-area-inset-* НЕ перезаписываем.
 * Читаем их + WebApp.safeAreaInset/contentSafeAreaInset и кладём результат
 * только в свои app-переменные --app-tg-*.
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

const SCREEN_EXTRA_GAP = 16;
const SHEET_EXTRA_GAP = 8;

/**
 * Защитный fallback нужен только когда Telegram-клиент возвращает 0 для
 * contentSafeAreaInset.top, но fullscreen/header фактически перекрывает UI.
 * Если Telegram отдаёт реальное значение, оно всегда будет использовано вместо fallback.
 */
const MOBILE_CONTENT_TOP_FALLBACK = 64;

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
    // Часть клиентов работает только через официальный WebApp объект.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Web-клиент может запретить postMessage — это не критично.
  }
};

const requestTelegramSafeAreas = () => {
  postTelegramWebEvent("web_app_request_safe_area", {});
  postTelegramWebEvent("web_app_request_content_safe_area", {});
};

const normalizePx = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
};

const readCssPx = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return 0;

  return normalizePx(rawValue.replace("px", ""));
};

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (!tg || typeof navigator === "undefined") return false;

  const platform = tg.platform?.toLowerCase() ?? "";
  if (platform === "ios" || platform === "android" || platform === "android_x") {
    return true;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUserAgent =
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod") ||
    userAgent.includes("android") ||
    userAgent.includes("mobile");

  const isTouchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true;

  return isMobileUserAgent && isTouchDevice;
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
    tg?.viewportStableHeight ?? window.innerHeight ?? window.visualViewport?.height ?? 0,
  );
};

const getOfficialInsets = (tg: TelegramWebApp | undefined) => {
  const cssSafeTop = readCssPx("--tg-safe-area-inset-top");
  const cssSafeRight = readCssPx("--tg-safe-area-inset-right");
  const cssSafeBottom = readCssPx("--tg-safe-area-inset-bottom");
  const cssSafeLeft = readCssPx("--tg-safe-area-inset-left");

  const cssContentTop = readCssPx("--tg-content-safe-area-inset-top");
  const cssContentRight = readCssPx("--tg-content-safe-area-inset-right");
  const cssContentBottom = readCssPx("--tg-content-safe-area-inset-bottom");
  const cssContentLeft = readCssPx("--tg-content-safe-area-inset-left");

  const safeTop = Math.max(cssSafeTop, normalizePx(tg?.safeAreaInset?.top));
  const safeRight = Math.max(cssSafeRight, normalizePx(tg?.safeAreaInset?.right));
  const safeBottom = Math.max(cssSafeBottom, normalizePx(tg?.safeAreaInset?.bottom));
  const safeLeft = Math.max(cssSafeLeft, normalizePx(tg?.safeAreaInset?.left));

  const rawContentTop = Math.max(cssContentTop, normalizePx(tg?.contentSafeAreaInset?.top));
  const contentRight = Math.max(cssContentRight, normalizePx(tg?.contentSafeAreaInset?.right));
  const contentBottom = Math.max(cssContentBottom, normalizePx(tg?.contentSafeAreaInset?.bottom));
  const contentLeft = Math.max(cssContentLeft, normalizePx(tg?.contentSafeAreaInset?.left));

  const needsTopFallback =
    rawContentTop <= 0 &&
    isTelegramMobile(tg) &&
    (tg?.isFullscreen === true || fullscreenRequested);

  const contentTop = needsTopFallback ? MOBILE_CONTENT_TOP_FALLBACK : rawContentTop;

  return {
    safeTop,
    safeRight,
    safeBottom,
    safeLeft,
    contentTop,
    contentRight,
    contentBottom,
    contentLeft,
    rawContentTop,
    usedTopFallback: needsTopFallback,
  };
};

const setPxVar = (root: HTMLElement, name: string, value: number) => {
  root.style.setProperty(name, `${normalizePx(value)}px`);
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewportHeight = getViewportHeight(tg);
  const stableHeight = getStableViewportHeight(tg);
  const appHeight = Math.max(stableHeight, viewportHeight, 1);
  const insets = getOfficialInsets(tg);

  const screenTopOffset = insets.safeTop + insets.contentTop + SCREEN_EXTRA_GAP;
  const sheetTopLimit = insets.safeTop + insets.contentTop + SHEET_EXTRA_GAP;
  const safeBottom = Math.max(insets.safeBottom, insets.contentBottom);

  setPxVar(root, "--app-height", appHeight);
  setPxVar(root, "--tg-viewport-height", viewportHeight);
  setPxVar(root, "--tg-viewport-stable-height", stableHeight);

  setPxVar(root, "--app-tg-safe-area-inset-top", insets.safeTop);
  setPxVar(root, "--app-tg-safe-area-inset-right", insets.safeRight);
  setPxVar(root, "--app-tg-safe-area-inset-bottom", insets.safeBottom);
  setPxVar(root, "--app-tg-safe-area-inset-left", insets.safeLeft);

  setPxVar(root, "--app-tg-content-safe-area-inset-top", insets.contentTop);
  setPxVar(root, "--app-tg-content-safe-area-inset-right", insets.contentRight);
  setPxVar(root, "--app-tg-content-safe-area-inset-bottom", insets.contentBottom);
  setPxVar(root, "--app-tg-content-safe-area-inset-left", insets.contentLeft);
  setPxVar(root, "--app-tg-content-safe-area-inset-top-raw", insets.rawContentTop);

  setPxVar(root, "--app-tg-safe-top", insets.safeTop + insets.contentTop);
  setPxVar(root, "--app-tg-safe-bottom", safeBottom);
  setPxVar(root, "--app-tg-screen-top-offset", screenTopOffset);
  setPxVar(root, "--app-tg-sheet-top-limit", sheetTopLimit);
  setPxVar(root, "--safe-bottom", safeBottom);

  root.style.setProperty("--app-tg-used-top-fallback", insets.usedTopFallback ? "1" : "0");
  root.classList.toggle("tg-mobile", isTelegramMobile(tg));
  root.classList.toggle("tg-safe-area-fallback", insets.usedTopFallback);
  root.classList.add("tg-swipe-lock");

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen ?? false);
  root.dataset.tgOfficialContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgRawContentSafeTop = String(insets.rawContentTop);
  root.dataset.tgUsedTopFallback = String(insets.usedTopFallback);
  root.dataset.appTgScreenTopOffset = String(screenTopOffset);
  root.dataset.appTgSheetTopLimit = String(sheetTopLimit);
};

/** Отключает нативный вертикальный свайп Telegram и обновляет viewport-переменные. */
export const lockTelegramSwipeBehavior = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    // Telegram bridge может быть ещё не готов на первом тике.
  }

  if (!fullscreenRequested) {
    fullscreenRequested = true;

    try {
      tg?.requestFullscreen?.();
    } catch {
      // Fullscreen поддерживается не на всех клиентах.
    }
  }

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
    window.setTimeout(() => {
      requestTelegramSafeAreas();
      updateTelegramViewportVars();
    }, delay);
  });
};

/** Инициализирует отслеживание viewport Telegram и возвращает функцию очистки. */
export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const tg = getTelegramWebApp();
  const retryTimers = [50, 150, 350, 700, 1200, 2000].map((delay) => {
    return window.setTimeout(() => {
      requestTelegramSafeAreas();
      updateTelegramViewportVars();
    }, delay);
  });

  let rafId: number | null = null;

  const handleViewportUpdate = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      requestTelegramSafeAreas();
      updateTelegramViewportVars();
    });
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  tg?.onEvent?.("safeAreaChanged", handleViewportUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleViewportUpdate);
  tg?.onEvent?.("fullscreenChanged", handleViewportUpdate);
  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleViewportUpdate);
  document.addEventListener("visibilitychange", handleViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }

    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    tg?.offEvent?.("safeAreaChanged", handleViewportUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleViewportUpdate);
    tg?.offEvent?.("fullscreenChanged", handleViewportUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleViewportUpdate);
    document.removeEventListener("visibilitychange", handleViewportUpdate);
    document.documentElement.classList.remove("tg-mobile");
  };
};
