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
  | "fullscreenChanged"
  | "fullscreenFailed";

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

const TABBAR_EXTRA_GAP = 10;
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
  const shortestSide = Math.min(window.innerWidth, window.innerHeight);
  const longestSide = Math.max(window.innerWidth, window.innerHeight);
  const isCompactViewport = shortestSide <= 820;

  /*
    В Telegram iOS/Android на первом portrait-render платформа и safe-area
    иногда приходят позже. Landscape успевает пересчитать viewport, поэтому
    там всё выглядит правильно. Этот fallback ловит именно phone portrait до
    прихода Telegram-событий. Desktop/Web Telegram отсекается выше по platform.
  */
  const isPhoneSizedViewport = shortestSide <= 600 && longestSide <= 1200;

  return isMobileUserAgent || (isTouchDevice && isCompactViewport) || isPhoneSizedViewport;
};

const isPhonePortraitViewport = () => {
  if (typeof window === "undefined") return false;

  const shortestSide = Math.min(window.innerWidth, window.innerHeight);
  const longestSide = Math.max(window.innerWidth, window.innerHeight);

  return window.innerHeight >= window.innerWidth && shortestSide <= 600 && longestSide <= 1200;
};

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (isKnownTelegramMobilePlatform(tg)) return true;
  if (isKnownTelegramDesktopPlatform(tg)) return false;

  return isMobileDeviceViewport();
};

const prepareTelegramWebApp = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    // Telegram bridge может быть ещё не готов на первом тике.
  }

  if (tg && !fullscreenRequested) {
    fullscreenRequested = true;

    try {
      tg.requestFullscreen?.();
    } catch {
      // Fullscreen поддерживается не на всех клиентах.
    }
  }

  return tg;
};

const getViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return normalizePx(
    tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight,
  );
};

const getPotentialStableHeight = (tg: TelegramWebApp | undefined) => {
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

const getVisualBottom = () => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;
  if (!visualViewport) return normalizePx(window.innerHeight);

  return normalizePx(visualViewport.offsetTop + visualViewport.height);
};

const getKeyboardMetrics = (tg: TelegramWebApp | undefined) => {
  const viewportHeight = getViewportHeight(tg);
  const potentialStableHeight = getPotentialStableHeight(tg);

  if (stableViewportHeight <= 0) {
    stableViewportHeight = Math.max(potentialStableHeight, viewportHeight, 1);
  }

  const visualBottom = getVisualBottom();
  const keyboardOffset = normalizePx(
    Math.max(
      0,
      stableViewportHeight - visualBottom,
      stableViewportHeight - viewportHeight,
    ),
  );
  const isKeyboardOpen = keyboardOffset > KEYBOARD_DETECTION_GAP;

  /*
    Стабильную высоту увеличиваем, когда Telegram отдаёт большую высоту.
    Во время клавиатуры её не уменьшаем — иначе главный экран начинает прыгать.
  */
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

  // Берём только системные значения Telegram: contentSafeAreaInset.top и safeAreaInset.top.
  // Никаких искусственных fallback, минимумов или +px сверху здесь нет.
  const contentTop = Math.max(rawContentTop, safeTop);

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
    usedTopFallback: false,
  };
};

const setPxVar = (root: HTMLElement, name: string, value: number) => {
  root.style.setProperty(name, `${normalizePx(value)}px`);
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewport = getKeyboardMetrics(tg);
  const insets = getOfficialInsets(tg);

  const viewportLooksMobile = isMobileDeviceViewport();
  const isDesktopTelegram = isKnownTelegramDesktopPlatform(tg) && !viewportLooksMobile;
  const isPhonePortrait = isPhonePortraitViewport();
  const mobileTelegram = !isDesktopTelegram && (isTelegramMobile(tg) || isPhonePortrait || viewportLooksMobile);

  // Все верхние app-переменные равны только системному safe/content safe.
  // Без +10, без 44/52/56, без screen/header fallback.
  const screenTopOffset = insets.contentTop;
  const homeSafeTop = insets.contentTop;
  const editorSafeTop = insets.contentTop;
  const sheetTopLimit = insets.contentTop;
  const editorControlsTop = insets.contentTop;
  const safeBottom = Math.max(insets.safeBottom, insets.contentBottom);
  const sheetBottomGap = Math.max(10, safeBottom + 10);
  const tabbarBottomGap = Math.max(10, safeBottom + TABBAR_EXTRA_GAP);

  setPxVar(root, "--app-height", viewport.stableHeight);
  setPxVar(root, "--tg-viewport-height", viewport.viewportHeight);
  setPxVar(root, "--tg-viewport-stable-height", viewport.stableHeight);
  setPxVar(root, "--tg-keyboard-offset", viewport.keyboardOffset);
  setPxVar(root, "--sheet-keyboard-offset", viewport.keyboardOffset);
  setPxVar(root, "--app-keyboard-offset", viewport.keyboardOffset);

  setPxVar(root, "--app-tg-safe-area-inset-top", insets.safeTop);
  setPxVar(root, "--app-tg-safe-area-inset-right", insets.safeRight);
  setPxVar(root, "--app-tg-safe-area-inset-bottom", insets.safeBottom);
  setPxVar(root, "--app-tg-safe-area-inset-left", insets.safeLeft);

  setPxVar(root, "--app-tg-content-safe-area-inset-top", insets.contentTop);
  setPxVar(root, "--app-tg-content-safe-area-inset-right", insets.contentRight);
  setPxVar(root, "--app-tg-content-safe-area-inset-bottom", insets.contentBottom);
  setPxVar(root, "--app-tg-content-safe-area-inset-left", insets.contentLeft);
  setPxVar(root, "--app-tg-content-safe-area-inset-top-raw", insets.rawContentTop);

  setPxVar(root, "--app-tg-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-safe-bottom", safeBottom);
  setPxVar(root, "--app-tg-screen-top-offset", screenTopOffset);
  setPxVar(root, "--app-home-safe-top", homeSafeTop);
  setPxVar(root, "--app-editor-safe-top", editorSafeTop);
  setPxVar(root, "--app-tg-editor-controls-top", editorControlsTop);
  setPxVar(root, "--app-tg-sheet-top-limit", sheetTopLimit);
  setPxVar(root, "--app-tabbar-bottom-gap", tabbarBottomGap);
  setPxVar(root, "--sheet-bottom-gap", sheetBottomGap);
  setPxVar(root, "--safe-top", insets.contentTop);
  setPxVar(root, "--safe-bottom", safeBottom);

  // Старые имена оставляем, чтобы не ломать компоненты, которые ещё их читают.
  setPxVar(root, "--tg-safe-top", insets.contentTop);
  setPxVar(root, "--tg-safe-bottom", safeBottom);
  setPxVar(root, "--tg-top-navigation-space", screenTopOffset);

  root.classList.toggle("tg-mobile", mobileTelegram);
  root.classList.toggle("tg-desktop", !mobileTelegram);
  root.classList.toggle("tg-phone-portrait", mobileTelegram && isPhonePortrait);
  root.classList.toggle("tg-phone-landscape", mobileTelegram && !isPhonePortrait);
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.toggle("tg-safe-area-fallback", false);
  root.classList.add("tg-swipe-lock");

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen ?? false);
  root.dataset.tgOfficialContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgRawContentSafeTop = String(insets.rawContentTop);
  root.dataset.tgUsedTopFallback = String(insets.usedTopFallback);
  root.dataset.tgKeyboardOffset = String(viewport.keyboardOffset);
  root.dataset.tgIsPhonePortrait = String(isPhonePortrait);
  root.dataset.appTgScreenTopOffset = String(screenTopOffset);
  root.dataset.appHomeSafeTop = String(homeSafeTop);
  root.dataset.appEditorSafeTop = String(editorSafeTop);
  root.dataset.appTgEditorControlsTop = String(editorControlsTop);
  root.dataset.appTgSheetTopLimit = String(sheetTopLimit);
  root.dataset.appTabbarBottomGap = String(tabbarBottomGap);
  root.dataset.sheetBottomGap = String(sheetBottomGap);

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
    document.documentElement.classList.remove("tg-mobile", "tg-desktop", "tg-phone-portrait", "tg-phone-landscape", "tg-keyboard-open");
  };
};
