/**
 * Telegram viewport adapter.
 *
 * Главный принцип: НЕ переопределяем официальные CSS-переменные Telegram
 * `--tg-safe-area-inset-*` и `--tg-content-safe-area-inset-*`.
 * Мы только читаем их / WebApp.safeAreaInset и складываем в свои `--app-tg-*` alias.
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

const KEYBOARD_DETECTION_GAP = 72;
const CHROME_LOCK_THROTTLE_MS = 900;
const CONTENT_SCREEN_GAP = 16;
const CONTENT_SHEET_GAP = 8;

let stableAppHeight = 0;
let lastChromeLockAt = 0;

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;

  return (window as TelegramWindow).Telegram?.WebApp;
};

const normalizePx = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value ?? 0));
};

const readCssPxVar = (root: HTMLElement, name: string) => {
  if (typeof window === "undefined") return 0;

  const rawValue = window.getComputedStyle(root).getPropertyValue(name).trim();
  if (!rawValue) return 0;

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue)) return 0;

  return normalizePx(parsedValue);
};

const pickInset = (apiValue: number | undefined, cssValue: number) => {
  return Math.max(normalizePx(apiValue), normalizePx(cssValue));
};

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown> | null) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Не все клиенты открывают низкоуровневый bridge.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Web-клиент может запретить postMessage.
  }
};

const getViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return normalizePx(
    tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight,
  );
};

const getStableHeightCandidate = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(
      tg?.viewportStableHeight ?? 0,
      tg?.viewportHeight ?? 0,
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      window.visualViewport?.height ?? 0,
    ),
  );
};

const getKeyboardInset = (baseHeight: number, tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;
  const visualBottom = visualViewport
    ? normalizePx(visualViewport.offsetTop + visualViewport.height)
    : getViewportHeight(tg);

  const visualInset = normalizePx(baseHeight - visualBottom);
  const telegramInset = normalizePx(baseHeight - getViewportHeight(tg));

  return normalizePx(Math.max(visualInset, telegramInset));
};

const requestTelegramSafeAreas = () => {
  postTelegramWebEvent("web_app_request_safe_area", null);
  postTelegramWebEvent("web_app_request_content_safe_area", null);
};

const updateTelegramViewportVars = (options?: { allowStableResize?: boolean }) => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const allowStableResize = options?.allowStableResize ?? true;

  const viewportHeight = getViewportHeight(tg);
  const stableCandidate = getStableHeightCandidate(tg);

  if (stableAppHeight <= 0) {
    stableAppHeight = stableCandidate || viewportHeight || 0;
  }

  const keyboardInsetBeforeResize = getKeyboardInset(stableAppHeight, tg);
  const keyboardOpen = keyboardInsetBeforeResize > KEYBOARD_DETECTION_GAP;

  if (!keyboardOpen && allowStableResize && stableCandidate > 0) {
    stableAppHeight = stableCandidate;
  }

  const keyboardInset = getKeyboardInset(stableAppHeight, tg);
  const isKeyboardOpen = keyboardInset > KEYBOARD_DETECTION_GAP;

  /*
    ВАЖНО: сначала читаем официальные CSS-переменные Telegram, потом берём API object.
    Мы НЕ записываем обратно `--tg-content-safe-area-inset-top`, чтобы не затереть
    значение, которое Telegram сам поставил в WebView.
  */
  const cssSafeTop = readCssPxVar(root, "--tg-safe-area-inset-top");
  const cssSafeRight = readCssPxVar(root, "--tg-safe-area-inset-right");
  const cssSafeBottom = readCssPxVar(root, "--tg-safe-area-inset-bottom");
  const cssSafeLeft = readCssPxVar(root, "--tg-safe-area-inset-left");

  const cssContentTop = readCssPxVar(root, "--tg-content-safe-area-inset-top");
  const cssContentRight = readCssPxVar(root, "--tg-content-safe-area-inset-right");
  const cssContentBottom = readCssPxVar(root, "--tg-content-safe-area-inset-bottom");
  const cssContentLeft = readCssPxVar(root, "--tg-content-safe-area-inset-left");

  const safeAreaTop = pickInset(tg?.safeAreaInset?.top, cssSafeTop);
  const safeAreaRight = pickInset(tg?.safeAreaInset?.right, cssSafeRight);
  const safeAreaBottom = pickInset(tg?.safeAreaInset?.bottom, cssSafeBottom);
  const safeAreaLeft = pickInset(tg?.safeAreaInset?.left, cssSafeLeft);

  const contentSafeAreaTop = pickInset(tg?.contentSafeAreaInset?.top, cssContentTop);
  const contentSafeAreaRight = pickInset(tg?.contentSafeAreaInset?.right, cssContentRight);
  const contentSafeAreaBottom = pickInset(tg?.contentSafeAreaInset?.bottom, cssContentBottom);
  const contentSafeAreaLeft = pickInset(tg?.contentSafeAreaInset?.left, cssContentLeft);

  const safeTop = normalizePx(safeAreaTop + contentSafeAreaTop);
  const safeRight = normalizePx(safeAreaRight + contentSafeAreaRight);
  const safeBottom = normalizePx(safeAreaBottom + contentSafeAreaBottom);
  const safeLeft = normalizePx(safeAreaLeft + contentSafeAreaLeft);

  const hasContentBounds = safeTop > 0 || safeBottom > 0 || safeLeft > 0 || safeRight > 0;
  const screenExtraGap = safeTop > 0 ? CONTENT_SCREEN_GAP : 0;
  const sheetExtraGap = safeTop > 0 ? CONTENT_SHEET_GAP : 0;
  const screenTopOffset = safeTop + screenExtraGap;
  const sheetTopLimit = safeTop + sheetExtraGap;

  root.style.setProperty("--app-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight || stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-keyboard-offset", `${isKeyboardOpen ? keyboardInset : 0}px`);

  /* App aliases. Только ими пользуются наши компоненты. */
  root.style.setProperty("--app-tg-safe-area-inset-top", `${safeAreaTop}px`);
  root.style.setProperty("--app-tg-safe-area-inset-right", `${safeAreaRight}px`);
  root.style.setProperty("--app-tg-safe-area-inset-bottom", `${safeAreaBottom}px`);
  root.style.setProperty("--app-tg-safe-area-inset-left", `${safeAreaLeft}px`);

  root.style.setProperty("--app-tg-content-safe-area-inset-top", `${contentSafeAreaTop}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-right", `${contentSafeAreaRight}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-bottom", `${contentSafeAreaBottom}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-left", `${contentSafeAreaLeft}px`);

  root.style.setProperty("--app-tg-safe-top", `${safeTop}px`);
  root.style.setProperty("--app-tg-safe-right", `${safeRight}px`);
  root.style.setProperty("--app-tg-safe-bottom", `${safeBottom}px`);
  root.style.setProperty("--app-tg-safe-left", `${safeLeft}px`);

  root.style.setProperty("--app-tg-screen-extra-gap", `${screenExtraGap}px`);
  root.style.setProperty("--app-tg-sheet-extra-gap", `${sheetExtraGap}px`);
  root.style.setProperty("--app-tg-screen-top-offset", `${screenTopOffset}px`);
  root.style.setProperty("--app-tg-sheet-top-limit", `${sheetTopLimit}px`);
  root.style.setProperty("--app-tg-screen-right-offset", `${safeRight}px`);
  root.style.setProperty("--app-tg-screen-bottom-offset", `${safeBottom}px`);
  root.style.setProperty("--app-tg-screen-left-offset", `${safeLeft}px`);

  /* Legacy aliases для старых компонентов. Это НЕ официальные Telegram inset vars. */
  root.style.setProperty("--tg-safe-top", `${safeTop}px`);
  root.style.setProperty("--tg-safe-right", `${safeRight}px`);
  root.style.setProperty("--tg-safe-bottom", `${safeBottom}px`);
  root.style.setProperty("--tg-safe-left", `${safeLeft}px`);
  root.style.setProperty("--tg-screen-top-offset", `${screenTopOffset}px`);
  root.style.setProperty("--tg-sheet-top-limit", `${sheetTopLimit}px`);

  root.classList.toggle("tg-has-content-safe-area", hasContentBounds);
  root.classList.toggle("tg-keyboard-open", isKeyboardOpen);
  root.classList.add("tg-swipe-lock");
};

const applyTelegramChromeLock = (options?: { expand?: boolean }) => {
  const tg = getTelegramWebApp();
  const expand = options?.expand ?? false;
  const now = Date.now();
  const canExpand = expand && now - lastChromeLockAt > CHROME_LOCK_THROTTLE_MS;

  try {
    tg?.ready?.();
    tg?.disableVerticalSwipes?.();

    if (canExpand && !document.documentElement.classList.contains("tg-keyboard-open")) {
      tg?.expand?.();
      lastChromeLockAt = now;
    }
  } catch {
    // Telegram bridge может быть ещё не готов.
  }

  try {
    if (canExpand && !document.documentElement.classList.contains("tg-keyboard-open")) {
      tg?.requestFullscreen?.();
    }
  } catch {
    // Fullscreen поддерживается не на всех клиентах.
  }

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });
};

export const lockTelegramSwipeBehavior = () => {
  requestTelegramSafeAreas();
  updateTelegramViewportVars({ allowStableResize: true });
  applyTelegramChromeLock({ expand: true });
  updateTelegramViewportVars({ allowStableResize: true });
};

export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  window.requestAnimationFrame?.(() => {
    lockTelegramSwipeBehavior();
  });
};

export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const tg = getTelegramWebApp();
  const retryTimers = [50, 250, 700, 1500, 2500].map((delay) => {
    return window.setTimeout(() => {
      lockTelegramSwipeBehavior();
    }, delay);
  });

  const handleViewportUpdate = () => {
    updateTelegramViewportVars({ allowStableResize: false });
    applyTelegramChromeLock({ expand: false });
  };

  const handleStableViewportUpdate = () => {
    stableAppHeight = 0;
    lockTelegramSwipeBehavior();
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  tg?.onEvent?.("safeAreaChanged", handleStableViewportUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleStableViewportUpdate);
  tg?.onEvent?.("fullscreenChanged", handleStableViewportUpdate);
  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.visualViewport?.addEventListener("scroll", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleStableViewportUpdate);
  document.addEventListener("visibilitychange", handleStableViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    tg?.offEvent?.("safeAreaChanged", handleStableViewportUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleStableViewportUpdate);
    tg?.offEvent?.("fullscreenChanged", handleStableViewportUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.visualViewport?.removeEventListener("scroll", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleStableViewportUpdate);
    document.removeEventListener("visibilitychange", handleStableViewportUpdate);
    document.documentElement.classList.remove("tg-has-content-safe-area", "tg-keyboard-open");
  };
};
