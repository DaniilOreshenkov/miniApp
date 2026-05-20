/**
 * Telegram viewport adapter.
 *
 * Главное правило: официальные CSS-переменные Telegram
 * --tg-safe-area-inset-* и --tg-content-safe-area-inset-* НЕ перезаписываем.
 * Мы только читаем их и складываем в собственные alias-переменные --app-tg-*.
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
  isFullscreen?: boolean;

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
const SCREEN_EXTRA_GAP = 16;
const SHEET_EXTRA_GAP = 8;

let stableAppHeight = 0;
let lastChromeLockAt = 0;

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
};

const normalizePx = (value: number | undefined | null) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value ?? 0));
};

const readCssPx = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!rawValue) return 0;

  const numericValue = Number.parseFloat(rawValue.replace("px", ""));
  return Number.isFinite(numericValue) ? normalizePx(numericValue) : 0;
};

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown> = {}) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Некоторые клиенты Telegram не дают прямой доступ к proxy.
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

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (!tg || typeof navigator === "undefined") return false;

  const platform = tg.platform?.toLowerCase() ?? "";
  if (platform === "ios" || platform === "android" || platform === "android_x") {
    return true;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const mobileUserAgent =
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod") ||
    userAgent.includes("android") ||
    userAgent.includes("mobile");

  const touchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true;

  return mobileUserAgent && touchDevice;
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

const getTelegramInsets = (tg: TelegramWebApp | undefined) => {
  const safeTop = Math.max(
    readCssPx("--tg-safe-area-inset-top"),
    normalizePx(tg?.safeAreaInset?.top),
  );
  const safeRight = Math.max(
    readCssPx("--tg-safe-area-inset-right"),
    normalizePx(tg?.safeAreaInset?.right),
  );
  const safeBottom = Math.max(
    readCssPx("--tg-safe-area-inset-bottom"),
    normalizePx(tg?.safeAreaInset?.bottom),
  );
  const safeLeft = Math.max(
    readCssPx("--tg-safe-area-inset-left"),
    normalizePx(tg?.safeAreaInset?.left),
  );

  const contentTop = Math.max(
    readCssPx("--tg-content-safe-area-inset-top"),
    normalizePx(tg?.contentSafeAreaInset?.top),
  );
  const contentRight = Math.max(
    readCssPx("--tg-content-safe-area-inset-right"),
    normalizePx(tg?.contentSafeAreaInset?.right),
  );
  const contentBottom = Math.max(
    readCssPx("--tg-content-safe-area-inset-bottom"),
    normalizePx(tg?.contentSafeAreaInset?.bottom),
  );
  const contentLeft = Math.max(
    readCssPx("--tg-content-safe-area-inset-left"),
    normalizePx(tg?.contentSafeAreaInset?.left),
  );

  return {
    safeTop,
    safeRight,
    safeBottom,
    safeLeft,
    contentTop,
    contentRight,
    contentBottom,
    contentLeft,
    combinedTop: safeTop + contentTop,
    combinedRight: safeRight + contentRight,
    combinedBottom: safeBottom + contentBottom,
    combinedLeft: safeLeft + contentLeft,
  };
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
  const insets = getTelegramInsets(tg);

  const hasTelegramTopInset = insets.combinedTop > 0;
  const screenTopOffset = hasTelegramTopInset
    ? insets.combinedTop + SCREEN_EXTRA_GAP
    : 0;
  const sheetTopLimit = hasTelegramTopInset
    ? insets.combinedTop + SHEET_EXTRA_GAP
    : 0;

  /*
    Важно: --app-height держим стабильным и не уменьшаем его из-за клавиатуры.
    Иначе Telegram/iOS начинает двигать главный экран вместе с input.
  */
  root.style.setProperty("--app-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight || stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-keyboard-offset", `${isKeyboardOpen ? keyboardInset : 0}px`);

  /* App aliases. Официальные --tg-safe-area-inset-* НЕ трогаем. */
  root.style.setProperty("--app-tg-safe-area-inset-top", `${insets.safeTop}px`);
  root.style.setProperty("--app-tg-safe-area-inset-right", `${insets.safeRight}px`);
  root.style.setProperty("--app-tg-safe-area-inset-bottom", `${insets.safeBottom}px`);
  root.style.setProperty("--app-tg-safe-area-inset-left", `${insets.safeLeft}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-top", `${insets.contentTop}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-right", `${insets.contentRight}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-bottom", `${insets.contentBottom}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-left", `${insets.contentLeft}px`);
  root.style.setProperty("--app-tg-safe-top", `${insets.combinedTop}px`);
  root.style.setProperty("--app-tg-safe-right", `${insets.combinedRight}px`);
  root.style.setProperty("--app-tg-safe-bottom", `${insets.combinedBottom}px`);
  root.style.setProperty("--app-tg-safe-left", `${insets.combinedLeft}px`);
  root.style.setProperty("--app-tg-screen-top-offset", `${screenTopOffset}px`);
  root.style.setProperty("--app-tg-sheet-top-limit", `${sheetTopLimit}px`);

  /* Старые alias оставляем только для совместимости старых компонентов. */
  root.style.setProperty("--safe-top", `${insets.combinedTop}px`);
  root.style.setProperty("--safe-bottom", `${insets.combinedBottom}px`);
  root.style.setProperty("--tg-safe-top", `${insets.combinedTop}px`);
  root.style.setProperty("--tg-safe-bottom", `${insets.combinedBottom}px`);
  root.style.setProperty("--tg-top-navigation-space", `${screenTopOffset}px`);

  root.dataset.tgSafeTop = String(insets.safeTop);
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.appTgScreenTopOffset = String(screenTopOffset);
  root.dataset.appTgSheetTopLimit = String(sheetTopLimit);
  root.dataset.tgPlatform = tg?.platform ?? "";

  root.classList.toggle("tg-mobile", isTelegramMobile(tg));
  root.classList.toggle("tg-keyboard-open", isKeyboardOpen);
  root.classList.add("tg-swipe-lock");
};

const requestTelegramSafeAreas = () => {
  postTelegramWebEvent("web_app_request_safe_area");
  postTelegramWebEvent("web_app_request_content_safe_area");
};

const applyTelegramChromeLock = (options?: { expand?: boolean }) => {
  const tg = getTelegramWebApp();
  const expand = options?.expand ?? false;
  const now = Date.now();
  const canExpand = expand && now - lastChromeLockAt > CHROME_LOCK_THROTTLE_MS;
  const keyboardOpen = document.documentElement.classList.contains("tg-keyboard-open");

  try {
    tg?.ready?.();
    tg?.disableVerticalSwipes?.();

    if (canExpand && !keyboardOpen) {
      tg?.expand?.();
      lastChromeLockAt = now;
    }
  } catch {
    // Telegram bridge может быть ещё не готов на первом тике.
  }

  try {
    if (canExpand && !keyboardOpen && tg?.isVersionAtLeast?.("8.0")) {
      tg?.requestFullscreen?.();
    }
  } catch {
    // Fullscreen поддерживается не на всех клиентах.
  }

  requestTelegramSafeAreas();

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });
};

export const lockTelegramSwipeBehavior = () => {
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
  const retryTimers = [50, 160, 350, 700, 1200, 2000].map((delay) => {
    return window.setTimeout(() => {
      updateTelegramViewportVars({ allowStableResize: true });
      requestTelegramSafeAreas();
    }, delay);
  });

  const handleViewportUpdate = () => {
    updateTelegramViewportVars({ allowStableResize: false });
    applyTelegramChromeLock({ expand: false });
  };

  const handleSafeAreaUpdate = () => {
    updateTelegramViewportVars({ allowStableResize: false });
    requestTelegramSafeAreas();
  };

  const handleStableViewportUpdate = () => {
    stableAppHeight = 0;
    lockTelegramSwipeBehavior();
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  tg?.onEvent?.("safeAreaChanged", handleSafeAreaUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleSafeAreaUpdate);
  tg?.onEvent?.("fullscreenChanged", handleSafeAreaUpdate);

  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.visualViewport?.addEventListener("scroll", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleStableViewportUpdate);
  document.addEventListener("visibilitychange", handleStableViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    tg?.offEvent?.("safeAreaChanged", handleSafeAreaUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleSafeAreaUpdate);
    tg?.offEvent?.("fullscreenChanged", handleSafeAreaUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.visualViewport?.removeEventListener("scroll", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleStableViewportUpdate);
    document.removeEventListener("visibilitychange", handleStableViewportUpdate);
    document.documentElement.classList.remove("tg-mobile", "tg-keyboard-open");
  };
};
