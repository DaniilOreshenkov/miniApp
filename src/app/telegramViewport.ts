/**
 * Telegram viewport / safe-area adapter.
 *
 * Production rules:
 * - do not overwrite official Telegram CSS variables;
 * - keep stable app height separate from visual keyboard height;
 * - request Telegram safe areas and mirror them into --app-* variables;
 * - never call expand/requestFullscreen inside keyboard resize frames.
 */

type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type TelegramViewportChangedPayload = {
  isStateStable?: boolean;
};

type TelegramWebAppEvent =
  | "viewportChanged"
  | "safeAreaChanged"
  | "contentSafeAreaChanged"
  | "fullscreenChanged"
  | "fullscreenFailed";

type TelegramWebAppEventHandler = (event?: TelegramViewportChangedPayload) => void;

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isVersionAtLeast?: (version: string) => boolean;

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;
  isFullscreen?: boolean;
  isVerticalSwipesEnabled?: boolean;

  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;

  onEvent?: (eventType: TelegramWebAppEvent, eventHandler: TelegramWebAppEventHandler) => void;
  offEvent?: (eventType: TelegramWebAppEvent, eventHandler: TelegramWebAppEventHandler) => void;
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

type Insets = Required<TelegramInset>;

type KeyboardMetrics = {
  viewportHeight: number;
  visualHeight: number;
  stableHeight: number;
  keyboardOffset: number;
  isKeyboardOpen: boolean;
};

const DEFAULT_HORIZONTAL_PADDING = 18;
const SCREEN_EXTRA_GAP = 14;
const HOME_EXTRA_GAP = 8;
const SHEET_EXTRA_GAP = 8;
const TABBAR_EXTRA_GAP = 10;
const EDITOR_CONTROLS_EXTRA_GAP = 12;
const KEYBOARD_DETECTION_GAP = 72;
const MAX_KEYBOARD_SCREEN_RATIO = 0.72;

const MOBILE_CONTENT_TOP_FALLBACK_PORTRAIT = 40;
const MOBILE_CONTENT_TOP_FALLBACK_LANDSCAPE = 34;
const MOBILE_HOME_SAFE_TOP_MIN_PORTRAIT = 44;
const MOBILE_HOME_SAFE_TOP_MIN_LANDSCAPE = 34;
const MOBILE_EDITOR_SAFE_TOP_MIN_PORTRAIT = 52;
const MOBILE_EDITOR_SAFE_TOP_MIN_LANDSCAPE = 40;

const ZERO_INSETS: Insets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

let fullscreenRequested = false;
let stableViewportHeight = 0;
let lastOrientationKey = "";
let viewportRafId: number | null = null;
let safeAreaRequestTimerId: number | null = null;
let globalListenersInstalled = false;
let attachedTelegramWebApp: TelegramWebApp | undefined;

const lastSafeAreaByOrientation = new Map<string, Insets>();
const lastContentSafeAreaByOrientation = new Map<string, Insets>();

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;

  return (window as TelegramWindow).Telegram?.WebApp;
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

const setPxVar = (root: HTMLElement, name: string, value: number) => {
  root.style.setProperty(name, `${normalizePx(value)}px`);
};

const getTelegramPlatform = (tg: TelegramWebApp | undefined) => {
  return tg?.platform?.toLowerCase() ?? "";
};

const isKnownTelegramMobilePlatform = (tg: TelegramWebApp | undefined) => {
  const platform = getTelegramPlatform(tg);

  return platform === "ios" || platform === "android" || platform === "android_x";
};

const isKnownTelegramDesktopPlatform = (tg: TelegramWebApp | undefined) => {
  const platform = getTelegramPlatform(tg);

  return (
    platform === "tdesktop" ||
    platform === "web" ||
    platform === "weba" ||
    platform === "webk" ||
    platform === "macos" ||
    platform === "windows" ||
    platform === "linux"
  );
};

const getLayoutViewportWidth = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(Math.max(window.innerWidth ?? 0, document.documentElement.clientWidth ?? 0));
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(Math.max(window.innerHeight ?? 0, document.documentElement.clientHeight ?? 0));
};

const getVisualViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return normalizePx(window.visualViewport?.height ?? window.innerHeight);
};

const getOrientationKey = () => {
  if (typeof window === "undefined") return "unknown";

  const width = getLayoutViewportWidth() || window.innerWidth;
  const height = getLayoutViewportHeight() || window.innerHeight;
  const mode = width > height ? "landscape" : "portrait";
  const screenOrientation = window.screen?.orientation?.type ?? "";

  return `${mode}:${screenOrientation}`;
};

const isLandscapeViewport = () => getOrientationKey().startsWith("landscape");

const isMobileDeviceViewport = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

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
  const width = getLayoutViewportWidth() || window.innerWidth;
  const height = getLayoutViewportHeight() || window.innerHeight;
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const isCompactViewport = shortestSide <= 820;
  const isPhoneSizedViewport = shortestSide <= 620 && longestSide <= 1200;

  return isMobileUserAgent || (isTouchDevice && isCompactViewport) || isPhoneSizedViewport;
};

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (isKnownTelegramMobilePlatform(tg)) return true;
  if (isKnownTelegramDesktopPlatform(tg)) return false;

  return isMobileDeviceViewport();
};

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown>) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Telegram bridge can be unavailable on the first frame.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Web Telegram may block postMessage. Not critical.
  }
};

const requestTelegramSafeAreasNow = () => {
  postTelegramWebEvent("web_app_request_safe_area", {});
  postTelegramWebEvent("web_app_request_content_safe_area", {});
};

const scheduleTelegramSafeAreaRequest = () => {
  if (typeof window === "undefined") return;

  if (safeAreaRequestTimerId !== null) {
    window.clearTimeout(safeAreaRequestTimerId);
  }

  safeAreaRequestTimerId = window.setTimeout(() => {
    safeAreaRequestTimerId = null;
    requestTelegramSafeAreasNow();
  }, 40);
};

const prepareTelegramWebApp = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    // Telegram bridge may not be ready yet.
  }

  if (tg && !fullscreenRequested) {
    fullscreenRequested = true;

    try {
      if (tg.isVersionAtLeast?.("8.0") !== false) {
        tg.requestFullscreen?.();
      }
    } catch {
      // Fullscreen is not available on all Telegram clients.
    }
  }

  return tg;
};

const getTelegramViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return normalizePx(tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight);
};

const getPotentialStableHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(
      tg?.viewportStableHeight ?? 0,
      window.innerHeight ?? 0,
      document.documentElement.clientHeight ?? 0,
      tg?.viewportHeight ?? 0,
      window.visualViewport?.height ?? 0,
    ),
  );
};

const getVisualBottom = () => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;
  if (!visualViewport) return normalizePx(window.innerHeight);

  return normalizePx(visualViewport.offsetTop + visualViewport.height);
};

const getKeyboardMetrics = (tg: TelegramWebApp | undefined): KeyboardMetrics => {
  const orientationKey = getOrientationKey();
  const telegramViewportHeight = getTelegramViewportHeight(tg);
  const visualHeight = getVisualViewportHeight();
  const layoutViewportHeight = getLayoutViewportHeight();
  const potentialStableHeight = getPotentialStableHeight(tg);

  if (lastOrientationKey !== orientationKey) {
    lastOrientationKey = orientationKey;
    stableViewportHeight = Math.max(potentialStableHeight, layoutViewportHeight, telegramViewportHeight, visualHeight, 1);
  }

  if (stableViewportHeight <= 0) {
    stableViewportHeight = Math.max(potentialStableHeight, layoutViewportHeight, telegramViewportHeight, visualHeight, 1);
  }

  const visualBottom = getVisualBottom();
  const rawKeyboardOffset = Math.max(
    0,
    stableViewportHeight - visualBottom,
    stableViewportHeight - visualHeight,
    stableViewportHeight - telegramViewportHeight,
  );
  const keyboardOffset = normalizePx(
    Math.min(rawKeyboardOffset, Math.round(stableViewportHeight * MAX_KEYBOARD_SCREEN_RATIO)),
  );
  const isKeyboardOpen = keyboardOffset > KEYBOARD_DETECTION_GAP;

  if (!isKeyboardOpen && potentialStableHeight > stableViewportHeight) {
    stableViewportHeight = potentialStableHeight;
  }

  return {
    viewportHeight: telegramViewportHeight,
    visualHeight: Math.max(visualHeight, 1),
    stableHeight: Math.max(stableViewportHeight, telegramViewportHeight, visualHeight, 1),
    keyboardOffset,
    isKeyboardOpen,
  };
};

const readOfficialInsets = (tg: TelegramWebApp | undefined) => {
  const safeArea: Insets = {
    top: Math.max(readCssPx("--tg-safe-area-inset-top"), normalizePx(tg?.safeAreaInset?.top)),
    right: Math.max(readCssPx("--tg-safe-area-inset-right"), normalizePx(tg?.safeAreaInset?.right)),
    bottom: Math.max(readCssPx("--tg-safe-area-inset-bottom"), normalizePx(tg?.safeAreaInset?.bottom)),
    left: Math.max(readCssPx("--tg-safe-area-inset-left"), normalizePx(tg?.safeAreaInset?.left)),
  };

  const contentSafeArea: Insets = {
    top: Math.max(readCssPx("--tg-content-safe-area-inset-top"), normalizePx(tg?.contentSafeAreaInset?.top)),
    right: Math.max(readCssPx("--tg-content-safe-area-inset-right"), normalizePx(tg?.contentSafeAreaInset?.right)),
    bottom: Math.max(readCssPx("--tg-content-safe-area-inset-bottom"), normalizePx(tg?.contentSafeAreaInset?.bottom)),
    left: Math.max(readCssPx("--tg-content-safe-area-inset-left"), normalizePx(tg?.contentSafeAreaInset?.left)),
  };

  return { safeArea, contentSafeArea };
};

const rememberNonZeroInsets = (storage: Map<string, Insets>, key: string, next: Insets) => {
  const previous = storage.get(key) ?? ZERO_INSETS;
  const merged: Insets = {
    top: next.top > 0 ? next.top : previous.top,
    right: next.right > 0 ? next.right : previous.right,
    bottom: next.bottom > 0 ? next.bottom : previous.bottom,
    left: next.left > 0 ? next.left : previous.left,
  };

  storage.set(key, merged);

  return merged;
};

const getOfficialInsets = (tg: TelegramWebApp | undefined) => {
  const orientationKey = getOrientationKey();
  const mobileTelegram = isTelegramMobile(tg) || isMobileDeviceViewport();
  const isLandscape = isLandscapeViewport();
  const { safeArea, contentSafeArea } = readOfficialInsets(tg);

  const rememberedSafeArea = rememberNonZeroInsets(lastSafeAreaByOrientation, orientationKey, safeArea);
  const rememberedContentSafeArea = rememberNonZeroInsets(
    lastContentSafeAreaByOrientation,
    orientationKey,
    contentSafeArea,
  );

  const safeTop = Math.max(safeArea.top, rememberedSafeArea.top);
  const safeRight = Math.max(safeArea.right, rememberedSafeArea.right);
  const safeBottom = Math.max(safeArea.bottom, rememberedSafeArea.bottom);
  const safeLeft = Math.max(safeArea.left, rememberedSafeArea.left);

  const rawContentTop = contentSafeArea.top;
  const rawContentRight = contentSafeArea.right;
  const rawContentBottom = contentSafeArea.bottom;
  const rawContentLeft = contentSafeArea.left;

  const rememberedContentTop = rememberedContentSafeArea.top;
  const rememberedContentRight = rememberedContentSafeArea.right;
  const rememberedContentBottom = rememberedContentSafeArea.bottom;
  const rememberedContentLeft = rememberedContentSafeArea.left;

  const topFallback = isLandscape
    ? MOBILE_CONTENT_TOP_FALLBACK_LANDSCAPE
    : MOBILE_CONTENT_TOP_FALLBACK_PORTRAIT;
  const needsTopFallback = mobileTelegram && rawContentTop <= 0 && rememberedContentTop <= 0;

  const contentTop = Math.max(
    rawContentTop,
    rememberedContentTop,
    needsTopFallback ? topFallback : 0,
  );
  const contentRight = Math.max(rawContentRight, rememberedContentRight, safeRight);
  const contentBottom = Math.max(rawContentBottom, rememberedContentBottom, safeBottom);
  const contentLeft = Math.max(rawContentLeft, rememberedContentLeft, safeLeft);

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
    rawContentRight,
    rawContentBottom,
    rawContentLeft,
    usedTopFallback: needsTopFallback,
  };
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewport = getKeyboardMetrics(tg);
  const insets = getOfficialInsets(tg);
  const viewportLooksMobile = isMobileDeviceViewport();
  const isDesktopTelegram = isKnownTelegramDesktopPlatform(tg) && !viewportLooksMobile;
  const mobileTelegram = !isDesktopTelegram && (isTelegramMobile(tg) || viewportLooksMobile);
  const isLandscape = isLandscapeViewport();

  const contentTopMin = isLandscape
    ? MOBILE_CONTENT_TOP_FALLBACK_LANDSCAPE
    : MOBILE_CONTENT_TOP_FALLBACK_PORTRAIT;
  const homeTopMin = isLandscape
    ? MOBILE_HOME_SAFE_TOP_MIN_LANDSCAPE
    : MOBILE_HOME_SAFE_TOP_MIN_PORTRAIT;
  const editorTopMin = isLandscape
    ? MOBILE_EDITOR_SAFE_TOP_MIN_LANDSCAPE
    : MOBILE_EDITOR_SAFE_TOP_MIN_PORTRAIT;

  const normalizedContentTop = mobileTelegram
    ? Math.max(insets.contentTop, contentTopMin)
    : insets.contentTop;

  const screenTopOffset = mobileTelegram
    ? Math.max(SCREEN_EXTRA_GAP, normalizedContentTop + SCREEN_EXTRA_GAP)
    : Math.max(0, insets.contentTop);
  const homeSafeTop = mobileTelegram
    ? Math.max(homeTopMin, normalizedContentTop + HOME_EXTRA_GAP)
    : Math.max(0, insets.contentTop);
  const editorSafeTop = mobileTelegram
    ? Math.max(editorTopMin, screenTopOffset)
    : Math.max(0, insets.contentTop);
  const sheetTopLimit = mobileTelegram
    ? Math.max(SHEET_EXTRA_GAP, normalizedContentTop + SHEET_EXTRA_GAP)
    : Math.max(SHEET_EXTRA_GAP, insets.contentTop + SHEET_EXTRA_GAP);
  const editorControlsTop = mobileTelegram
    ? Math.max(EDITOR_CONTROLS_EXTRA_GAP, normalizedContentTop + EDITOR_CONTROLS_EXTRA_GAP)
    : Math.max(EDITOR_CONTROLS_EXTRA_GAP, insets.contentTop + EDITOR_CONTROLS_EXTRA_GAP);

  const safeBottom = Math.max(insets.safeBottom, insets.contentBottom);
  const sheetBottomGap = Math.max(10, safeBottom + 10);
  const tabbarBottomGap = Math.max(10, safeBottom + TABBAR_EXTRA_GAP);
  const contentLeftPadding = Math.max(DEFAULT_HORIZONTAL_PADDING, insets.contentLeft + DEFAULT_HORIZONTAL_PADDING);
  const contentRightPadding = Math.max(DEFAULT_HORIZONTAL_PADDING, insets.contentRight + DEFAULT_HORIZONTAL_PADDING);

  setPxVar(root, "--app-height", viewport.stableHeight);
  setPxVar(root, "--app-stable-height", viewport.stableHeight);
  setPxVar(root, "--app-visual-height", viewport.visualHeight);
  setPxVar(root, "--tg-viewport-height", viewport.viewportHeight);
  setPxVar(root, "--tg-viewport-stable-height", viewport.stableHeight);
  setPxVar(root, "--tg-keyboard-offset", viewport.keyboardOffset);
  setPxVar(root, "--sheet-keyboard-offset", viewport.keyboardOffset);
  setPxVar(root, "--app-keyboard-offset", viewport.keyboardOffset);

  setPxVar(root, "--app-tg-safe-area-inset-top", insets.safeTop);
  setPxVar(root, "--app-tg-safe-area-inset-right", insets.safeRight);
  setPxVar(root, "--app-tg-safe-area-inset-bottom", insets.safeBottom);
  setPxVar(root, "--app-tg-safe-area-inset-left", insets.safeLeft);

  setPxVar(root, "--app-tg-content-safe-area-inset-top", normalizedContentTop);
  setPxVar(root, "--app-tg-content-safe-area-inset-right", insets.contentRight);
  setPxVar(root, "--app-tg-content-safe-area-inset-bottom", insets.contentBottom);
  setPxVar(root, "--app-tg-content-safe-area-inset-left", insets.contentLeft);
  setPxVar(root, "--app-tg-content-safe-area-inset-top-raw", insets.rawContentTop);
  setPxVar(root, "--app-tg-content-safe-area-inset-right-raw", insets.rawContentRight);
  setPxVar(root, "--app-tg-content-safe-area-inset-bottom-raw", insets.rawContentBottom);
  setPxVar(root, "--app-tg-content-safe-area-inset-left-raw", insets.rawContentLeft);

  setPxVar(root, "--app-tg-safe-top", normalizedContentTop);
  setPxVar(root, "--app-tg-safe-bottom", safeBottom);
  setPxVar(root, "--app-tg-screen-top-offset", screenTopOffset);
  setPxVar(root, "--app-home-safe-top", homeSafeTop);
  setPxVar(root, "--app-editor-safe-top", editorSafeTop);
  setPxVar(root, "--app-tg-editor-controls-top", editorControlsTop);
  setPxVar(root, "--app-tg-sheet-top-limit", sheetTopLimit);
  setPxVar(root, "--app-tabbar-bottom-gap", tabbarBottomGap);
  setPxVar(root, "--sheet-bottom-gap", sheetBottomGap);
  setPxVar(root, "--app-content-left-padding", contentLeftPadding);
  setPxVar(root, "--app-content-right-padding", contentRightPadding);
  setPxVar(root, "--safe-top", normalizedContentTop);
  setPxVar(root, "--safe-bottom", safeBottom);

  // Legacy aliases for old components.
  setPxVar(root, "--tg-safe-top", normalizedContentTop);
  setPxVar(root, "--tg-safe-bottom", safeBottom);
  setPxVar(root, "--tg-top-navigation-space", screenTopOffset);

  root.style.setProperty("--app-tg-used-top-fallback", insets.usedTopFallback ? "1" : "0");
  root.classList.toggle("tg-mobile", mobileTelegram);
  root.classList.toggle("tg-desktop", !mobileTelegram);
  root.classList.toggle("tg-phone-portrait", mobileTelegram && !isLandscape);
  root.classList.toggle("tg-phone-landscape", mobileTelegram && isLandscape);
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.toggle("tg-safe-area-fallback", insets.usedTopFallback);
  root.classList.add("tg-swipe-lock");

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen ?? false);
  root.dataset.tgOrientation = isLandscape ? "landscape" : "portrait";
  root.dataset.tgOfficialContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgContentSafeTop = String(normalizedContentTop);
  root.dataset.tgRawContentSafeTop = String(insets.rawContentTop);
  root.dataset.tgUsedTopFallback = String(insets.usedTopFallback);
  root.dataset.tgKeyboardOffset = String(viewport.keyboardOffset);
  root.dataset.appTgScreenTopOffset = String(screenTopOffset);
  root.dataset.appHomeSafeTop = String(homeSafeTop);
  root.dataset.appEditorSafeTop = String(editorSafeTop);
  root.dataset.appTgSheetTopLimit = String(sheetTopLimit);
  root.dataset.appTabbarBottomGap = String(tabbarBottomGap);
  root.dataset.sheetBottomGap = String(sheetBottomGap);
};

const scheduleViewportUpdate = () => {
  if (typeof window === "undefined") return;

  if (viewportRafId !== null) {
    window.cancelAnimationFrame(viewportRafId);
  }

  viewportRafId = window.requestAnimationFrame(() => {
    viewportRafId = null;
    updateTelegramViewportVars();
  });
};

const handleViewportUpdate = () => {
  // Do not call expand/requestFullscreen here: keyboard resize frames must be layout-only.
  scheduleViewportUpdate();
};

const handleSafeAreaUpdate = () => {
  scheduleViewportUpdate();
};

const handleOrientationChange = () => {
  stableViewportHeight = 0;
  lastOrientationKey = "";
  scheduleTelegramSafeAreaRequest();
  scheduleViewportUpdate();
  window.setTimeout(scheduleViewportUpdate, 120);
  window.setTimeout(scheduleViewportUpdate, 320);
};

const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    scheduleTelegramSafeAreaRequest();
  }

  scheduleViewportUpdate();
};

const detachTelegramEventListeners = () => {
  attachedTelegramWebApp?.offEvent?.("viewportChanged", handleViewportUpdate);
  attachedTelegramWebApp?.offEvent?.("safeAreaChanged", handleSafeAreaUpdate);
  attachedTelegramWebApp?.offEvent?.("contentSafeAreaChanged", handleSafeAreaUpdate);
  attachedTelegramWebApp?.offEvent?.("fullscreenChanged", handleSafeAreaUpdate);
  attachedTelegramWebApp?.offEvent?.("fullscreenFailed", handleSafeAreaUpdate);
  attachedTelegramWebApp = undefined;
};

const attachTelegramEventListeners = () => {
  const tg = getTelegramWebApp();
  if (!tg || tg === attachedTelegramWebApp) return;

  detachTelegramEventListeners();

  attachedTelegramWebApp = tg;
  tg.onEvent?.("viewportChanged", handleViewportUpdate);
  tg.onEvent?.("safeAreaChanged", handleSafeAreaUpdate);
  tg.onEvent?.("contentSafeAreaChanged", handleSafeAreaUpdate);
  tg.onEvent?.("fullscreenChanged", handleSafeAreaUpdate);
  tg.onEvent?.("fullscreenFailed", handleSafeAreaUpdate);
};

const ensureGlobalViewportListeners = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  attachTelegramEventListeners();

  if (globalListenersInstalled) return;
  globalListenersInstalled = true;

  window.visualViewport?.addEventListener("resize", handleViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener("scroll", handleViewportUpdate, { passive: true });
  window.addEventListener("resize", handleViewportUpdate, { passive: true });
  window.addEventListener("orientationchange", handleOrientationChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
};

/** Disable Telegram pull-to-close and update viewport variables. */
export const lockTelegramSwipeBehavior = () => {
  prepareTelegramWebApp();

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });

  scheduleTelegramSafeAreaRequest();
  updateTelegramViewportVars();
};

/** Run before first React render. Safe to call multiple times. */
export const bootstrapTelegramViewport = () => {
  if (typeof window === "undefined") return;

  ensureGlobalViewportListeners();
  lockTelegramSwipeBehavior();

  const retryDelays = [0, 50, 120, 260, 520, 900, 1400, 2200];
  retryDelays.forEach((delay) => {
    window.setTimeout(() => {
      attachTelegramEventListeners();
      scheduleTelegramSafeAreaRequest();
      scheduleViewportUpdate();
    }, delay);
  });
};

/** Initializes viewport tracking. Kept for app/App.tsx compatibility. */
export const initTelegramViewport = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  ensureGlobalViewportListeners();
  lockTelegramSwipeBehavior();

  const retryTimers = [50, 120, 260, 520, 900, 1400, 2200].map((delay) => {
    return window.setTimeout(() => {
      attachTelegramEventListeners();
      scheduleTelegramSafeAreaRequest();
      scheduleViewportUpdate();
    }, delay);
  });

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
  };
};
