/**
 * Telegram viewport adapter.
 *
 * Важно:
 * - официальные CSS-переменные Telegram `--tg-safe-area-inset-*` и
 *   `--tg-content-safe-area-inset-*` НЕ перезаписываем;
 * - читаем их + WebApp.safeAreaInset/contentSafeAreaInset;
 * - в приложение отдаём только свои alias-переменные `--app-tg-*`;
 * - `bootstrapTelegramViewport()` сразу ставит обработчики, потому что safe-area
 *   часто приходит после requestFullscreen/fullscreenChanged, а не в первый тик.
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

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;
  version?: string;
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
const MOBILE_FULLSCREEN_CONTENT_TOP_FALLBACK = 56;

let stableAppHeight = 0;
let lastChromeLockAt = 0;
let fullscreenRequested = false;
let trackingStarted = false;
let trackingCleanup: (() => void) | null = null;

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
};

const normalizePx = (value: number | undefined | null) => {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Math.round(value ?? 0));
};

const readCssPx = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!rawValue || rawValue.includes("calc") || rawValue.includes("max")) return 0;

  const numericValue = Number.parseFloat(rawValue.replace("px", ""));
  return normalizePx(numericValue);
};

const isMobileTelegramPlatform = (tg: TelegramWebApp | undefined) => {
  const platform = tg?.platform?.toLowerCase() ?? "";
  return platform === "ios" || platform === "android" || platform === "android_x";
};

const isFullscreenRequestedOrActive = (tg: TelegramWebApp | undefined) => {
  return Boolean(tg?.isFullscreen || fullscreenRequested);
};

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown>) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Bridge может быть недоступен в web/desktop-клиенте.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Не критично: официальный WebApp API остаётся основным способом.
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

const readTelegramInsets = (tg: TelegramWebApp | undefined) => {
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

  const contentTopFromTelegram = Math.max(
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

  /*
    Практический fallback: в части клиентов contentSafeAreaInset может прийти 0
    в первые тики после requestFullscreen, хотя верхний Telegram control уже
    перекрывает WebView. Это НЕ заменяет документацию: если Telegram отдал
    contentSafeAreaInset, используем его. Fallback включается только для mobile
    fullscreen и только пока official contentTop равен 0.
  */
  const fallbackContentTop =
    isMobileTelegramPlatform(tg) &&
    isFullscreenRequestedOrActive(tg) &&
    contentTopFromTelegram <= 0
      ? MOBILE_FULLSCREEN_CONTENT_TOP_FALLBACK
      : 0;

  const contentTop = Math.max(contentTopFromTelegram, fallbackContentTop);

  return {
    safeTop,
    safeRight,
    safeBottom,
    safeLeft,
    contentTop,
    contentRight,
    contentBottom,
    contentLeft,
    officialContentTop: contentTopFromTelegram,
    fallbackContentTop,
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
  const insets = readTelegramInsets(tg);

  const combinedTop = insets.safeTop + insets.contentTop;
  const combinedRight = insets.safeRight + insets.contentRight;
  const combinedBottom = Math.max(insets.safeBottom, insets.contentBottom);
  const combinedLeft = insets.safeLeft + insets.contentLeft;
  const screenTopOffset = combinedTop + SCREEN_EXTRA_GAP;
  const sheetTopLimit = combinedTop + SHEET_EXTRA_GAP;

  root.style.setProperty("--app-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight || stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-keyboard-offset", `${isKeyboardOpen ? keyboardInset : 0}px`);

  /* App aliases. Официальные Telegram `--tg-*` не перезаписываем. */
  root.style.setProperty("--app-tg-safe-area-inset-top", `${insets.safeTop}px`);
  root.style.setProperty("--app-tg-safe-area-inset-right", `${insets.safeRight}px`);
  root.style.setProperty("--app-tg-safe-area-inset-bottom", `${insets.safeBottom}px`);
  root.style.setProperty("--app-tg-safe-area-inset-left", `${insets.safeLeft}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-top", `${insets.contentTop}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-right", `${insets.contentRight}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-bottom", `${insets.contentBottom}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-left", `${insets.contentLeft}px`);
  root.style.setProperty("--app-tg-safe-top", `${combinedTop}px`);
  root.style.setProperty("--app-tg-safe-right", `${combinedRight}px`);
  root.style.setProperty("--app-tg-safe-bottom", `${combinedBottom}px`);
  root.style.setProperty("--app-tg-safe-left", `${combinedLeft}px`);
  root.style.setProperty("--app-tg-screen-top-offset-js", `${screenTopOffset}px`);
  root.style.setProperty("--app-tg-sheet-top-limit-js", `${sheetTopLimit}px`);

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgIsFullscreen = String(Boolean(tg?.isFullscreen));
  root.dataset.tgSafeTop = String(insets.safeTop);
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgOfficialContentSafeTop = String(insets.officialContentTop);
  root.dataset.tgFallbackContentSafeTop = String(insets.fallbackContentTop);
  root.dataset.appTgScreenTopOffset = String(screenTopOffset);
  root.dataset.appTgSheetTopLimit = String(sheetTopLimit);

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
    const canUseFullscreen = tg?.isVersionAtLeast?.("8.0") ?? true;
    if (
      canExpand &&
      canUseFullscreen &&
      !tg?.isFullscreen &&
      !document.documentElement.classList.contains("tg-keyboard-open")
    ) {
      tg?.requestFullscreen?.();
      fullscreenRequested = true;
    }
  } catch {
    // Fullscreen поддерживается не на всех клиентах.
  }

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });
};

export const lockTelegramSwipeBehavior = () => {
  updateTelegramViewportVars({ allowStableResize: true });
  applyTelegramChromeLock({ expand: true });
  updateTelegramViewportVars({ allowStableResize: true });
};

const startTelegramViewportTracking = () => {
  if (typeof window === "undefined" || trackingStarted) return;

  trackingStarted = true;

  const tg = getTelegramWebApp();
  const retryTimers = [50, 150, 300, 700, 1200, 2200].map((delay) => {
    return window.setTimeout(() => {
      lockTelegramSwipeBehavior();
    }, delay);
  });

  const handleSoftUpdate = () => {
    updateTelegramViewportVars({ allowStableResize: false });
  };

  const handleHardUpdate = () => {
    lockTelegramSwipeBehavior();
  };

  tg?.onEvent?.("viewportChanged", handleSoftUpdate);
  tg?.onEvent?.("safeAreaChanged", handleHardUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleHardUpdate);
  tg?.onEvent?.("fullscreenChanged", handleHardUpdate);
  tg?.onEvent?.("fullscreenFailed", handleHardUpdate);
  window.visualViewport?.addEventListener("resize", handleSoftUpdate);
  window.visualViewport?.addEventListener("scroll", handleSoftUpdate);
  window.addEventListener("resize", handleHardUpdate);
  window.addEventListener("orientationchange", handleHardUpdate);
  document.addEventListener("visibilitychange", handleHardUpdate);

  trackingCleanup = () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    tg?.offEvent?.("viewportChanged", handleSoftUpdate);
    tg?.offEvent?.("safeAreaChanged", handleHardUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleHardUpdate);
    tg?.offEvent?.("fullscreenChanged", handleHardUpdate);
    tg?.offEvent?.("fullscreenFailed", handleHardUpdate);
    window.visualViewport?.removeEventListener("resize", handleSoftUpdate);
    window.visualViewport?.removeEventListener("scroll", handleSoftUpdate);
    window.removeEventListener("resize", handleHardUpdate);
    window.removeEventListener("orientationchange", handleHardUpdate);
    document.removeEventListener("visibilitychange", handleHardUpdate);
    trackingStarted = false;
    trackingCleanup = null;
  };
};

export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();
  startTelegramViewportTracking();

  window.requestAnimationFrame?.(() => {
    lockTelegramSwipeBehavior();
  });
};

export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();
  startTelegramViewportTracking();

  return () => {
    trackingCleanup?.();
    document.documentElement.classList.remove("tg-keyboard-open");
  };
};
