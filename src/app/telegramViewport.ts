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

const SCREEN_EXTRA_GAP = 16;
const SHEET_EXTRA_GAP = 8;
const TABBAR_EXTRA_GAP = 10;
const EDITOR_CONTROLS_EXTRA_GAP = 12;
const KEYBOARD_DETECTION_GAP = 72;

/**
 * Защитный fallback нужен только когда Telegram-клиент возвращает 0 для
 * contentSafeAreaInset.top, но fullscreen/header фактически перекрывает UI.
 * Значение 96px — защитный верхний слой Telegram на iOS/Android
 * в fullscreen: статусная зона + строка кнопок Mini App. На desktop fallback не включается.
 * Важно: safeAreaInset.top сюда НЕ прибавляем, иначе на части клиентов
 * получится двойной верхний отступ.
 */
const MOBILE_CONTENT_TOP_FALLBACK = 96;

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

  const mobileTelegram = isTelegramMobile(tg);

  /*
    На части клиентов Telegram contentSafeAreaInset.top приходит 0,
    хотя верхняя системная зона/шапка Telegram визуально есть.
    Поэтому fallback включаем для мобильного Telegram всегда,
    а не только когда tg.isFullscreen уже успел стать true.
  */
  const needsTopFallback = rawContentTop <= 0 && mobileTelegram;

  const contentTop = needsTopFallback
    ? Math.max(rawContentTop, MOBILE_CONTENT_TOP_FALLBACK)
    : rawContentTop;

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
  const viewport = getKeyboardMetrics(tg);
  const insets = getOfficialInsets(tg);

  /*
    contentSafeAreaInset.top — это уже полный inset от верхнего края экрана
    до безопасной content-зоны. Поэтому НЕ складываем его с safeAreaInset.top,
    иначе на клиентах, где Telegram отдаёт оба значения, отступ станет двойным.
  */
  const screenTopOffset = Math.max(SCREEN_EXTRA_GAP, insets.contentTop + SCREEN_EXTRA_GAP);
  const sheetTopLimit = Math.max(SHEET_EXTRA_GAP, insets.contentTop + SHEET_EXTRA_GAP);
  const editorControlsTop = Math.max(
    EDITOR_CONTROLS_EXTRA_GAP,
    insets.contentTop + EDITOR_CONTROLS_EXTRA_GAP,
  );
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

  root.style.setProperty("--app-tg-used-top-fallback", insets.usedTopFallback ? "1" : "0");
  root.classList.toggle("tg-mobile", isTelegramMobile(tg));
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.toggle("tg-safe-area-fallback", insets.usedTopFallback);
  root.classList.add("tg-swipe-lock");

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen ?? false);
  root.dataset.tgOfficialContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgRawContentSafeTop = String(insets.rawContentTop);
  root.dataset.tgUsedTopFallback = String(insets.usedTopFallback);
  root.dataset.tgKeyboardOffset = String(viewport.keyboardOffset);
  root.dataset.appTgScreenTopOffset = String(screenTopOffset);
  root.dataset.appTgEditorControlsTop = String(editorControlsTop);
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
    requestTelegramSafeAreas();
    updateTelegramViewportVars();
  });
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

  if (tg && !fullscreenRequested) {
    fullscreenRequested = true;

    try {
      tg.requestFullscreen?.();
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
    document.documentElement.classList.remove("tg-mobile", "tg-keyboard-open");
  };
};
