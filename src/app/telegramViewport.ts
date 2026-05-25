/**
 * Telegram viewport/safe-area adapter.
 *
 * Важно: официальные CSS-переменные Telegram вида
 * --tg-safe-area-inset-* и --tg-content-safe-area-inset-* НЕ перезаписываем.
 * Читаем contentSafeAreaInset из Telegram WebApp/CSS/native event
 * и кладём его в свои app-переменные --app-tg-*.
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

type TelegramWebViewBridge = {
  receiveEvent?: (eventType: string, eventData?: unknown) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
    WebView?: TelegramWebViewBridge;
  };
  TelegramWebviewProxy?: TelegramWebviewProxy;
  external?: {
    notify?: (payload: string) => void;
  };
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

const postTelegramWebEvent = (
  eventType: string,
  eventData: Record<string, unknown> | null = null,
) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Часть клиентов работает только через официальный WebApp объект.
  }

  try {
    (window as TelegramWindow).external?.notify?.(
      JSON.stringify({ eventType, eventData }),
    );
  } catch {
    // Android WebView fallback может отсутствовать.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "*",
      );
    }
  } catch {
    // Web-клиент может запретить postMessage — это не критично.
  }
};

const requestTelegramSafeAreas = () => {
  postTelegramWebEvent("web_app_request_safe_area", null);
  postTelegramWebEvent("web_app_request_content_safe_area", null);
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


const ensureViewportFitCoverMeta = () => {
  if (typeof document === "undefined") return;

  const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const viewportContent = viewportMeta?.content ?? "";

  if (viewportMeta && viewportContent.includes("viewport-fit=cover")) return;

  const nextContent = viewportContent
    ? `${viewportContent}, viewport-fit=cover`
    : "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no";

  if (viewportMeta) {
    viewportMeta.content = nextContent;
    return;
  }

  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = nextContent;
  document.head.appendChild(meta);
};

type NativeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const manualSafeAreaInset: NativeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const manualContentSafeAreaInset: NativeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

let lastWrappedReceiveEvent: TelegramWebViewBridge["receiveEvent"] | null = null;
let messageListenerInstalled = false;

const readInsetFromEventData = (eventData: unknown): NativeInsets => {
  const data = eventData && typeof eventData === "object" ? eventData as Record<string, unknown> : {};

  return {
    top: normalizePx(data.top),
    right: normalizePx(data.right),
    bottom: normalizePx(data.bottom),
    left: normalizePx(data.left),
  };
};

const applyNativeSafeAreaEvent = (eventType: string, eventData: unknown) => {
  if (eventType === "safe_area_changed") {
    const nextInset = readInsetFromEventData(eventData);
    manualSafeAreaInset.top = nextInset.top;
    manualSafeAreaInset.right = nextInset.right;
    manualSafeAreaInset.bottom = nextInset.bottom;
    manualSafeAreaInset.left = nextInset.left;
    window.setTimeout(scheduleViewportUpdate, 0);
    return;
  }

  if (eventType === "content_safe_area_changed") {
    const nextInset = readInsetFromEventData(eventData);
    manualContentSafeAreaInset.top = nextInset.top;
    manualContentSafeAreaInset.right = nextInset.right;
    manualContentSafeAreaInset.bottom = nextInset.bottom;
    manualContentSafeAreaInset.left = nextInset.left;
    window.setTimeout(scheduleViewportUpdate, 0);
  }
};

const installNativeTelegramEventBridge = () => {
  if (typeof window === "undefined") return;

  const telegramWindow = window as TelegramWindow;
  telegramWindow.Telegram = telegramWindow.Telegram ?? {};
  telegramWindow.Telegram.WebView = telegramWindow.Telegram.WebView ?? {};

  const bridge = telegramWindow.Telegram.WebView;

  if (bridge.receiveEvent !== lastWrappedReceiveEvent) {
    const originalReceiveEvent = bridge.receiveEvent;

    const wrappedReceiveEvent = function receiveEventWrapper(
      this: TelegramWebViewBridge,
      eventType: string,
      eventData?: unknown,
    ) {
      applyNativeSafeAreaEvent(eventType, eventData);
      return originalReceiveEvent?.call(this, eventType, eventData);
    };

    bridge.receiveEvent = wrappedReceiveEvent;
    lastWrappedReceiveEvent = wrappedReceiveEvent;
  }

  if (!messageListenerInstalled) {
    messageListenerInstalled = true;

    window.addEventListener("message", (event) => {
      const rawData = event.data;
      let parsedData: unknown = rawData;

      if (typeof rawData === "string") {
        try {
          parsedData = JSON.parse(rawData);
        } catch {
          return;
        }
      }

      if (!parsedData || typeof parsedData !== "object") return;

      const payload = parsedData as { eventType?: unknown; eventData?: unknown };
      if (typeof payload.eventType !== "string") return;

      applyNativeSafeAreaEvent(payload.eventType, payload.eventData);
    });
  }
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
  ensureViewportFitCoverMeta();
  installNativeTelegramEventBridge();

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

    postTelegramWebEvent("web_app_request_fullscreen", null);
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

  const safeTop = Math.max(
    cssSafeTop,
    normalizePx(tg?.safeAreaInset?.top),
    manualSafeAreaInset.top,
  );
  const safeRight = Math.max(
    cssSafeRight,
    normalizePx(tg?.safeAreaInset?.right),
    manualSafeAreaInset.right,
  );
  const safeBottom = Math.max(
    cssSafeBottom,
    normalizePx(tg?.safeAreaInset?.bottom),
    manualSafeAreaInset.bottom,
  );
  const safeLeft = Math.max(
    cssSafeLeft,
    normalizePx(tg?.safeAreaInset?.left),
    manualSafeAreaInset.left,
  );

  const rawContentTop = Math.max(
    cssContentTop,
    normalizePx(tg?.contentSafeAreaInset?.top),
    manualContentSafeAreaInset.top,
  );
  const contentRight = Math.max(
    cssContentRight,
    normalizePx(tg?.contentSafeAreaInset?.right),
    manualContentSafeAreaInset.right,
  );
  const contentBottom = Math.max(
    cssContentBottom,
    normalizePx(tg?.contentSafeAreaInset?.bottom),
    manualContentSafeAreaInset.bottom,
  );
  const contentLeft = Math.max(
    cssContentLeft,
    normalizePx(tg?.contentSafeAreaInset?.left),
    manualContentSafeAreaInset.left,
  );

  /*
    ВАЖНО: верх берём строго из contentSafeAreaInset.top.
    Не подмешиваем safeAreaInset.top, visualViewport.offsetTop и ручные fallback.
    Если Telegram отдаёт 0 — оставляем 0, чтобы не было кривого искусственного отступа.
  */
  const contentTop = rawContentTop;

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

  ensureViewportFitCoverMeta();
  installNativeTelegramEventBridge();

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewport = getKeyboardMetrics(tg);
  const insets = getOfficialInsets(tg);

  const viewportLooksMobile = isMobileDeviceViewport();
  const isDesktopTelegram = isKnownTelegramDesktopPlatform(tg) && !viewportLooksMobile;
  const isPhonePortrait = isPhonePortraitViewport();
  const mobileTelegram = !isDesktopTelegram && (isTelegramMobile(tg) || isPhonePortrait || viewportLooksMobile);

  /*
    Один источник верхнего отступа для всего приложения: только Telegram contentSafeAreaInset.top.
    Добавочных технических отступов, safeAreaInset.top, visualViewport и fallback сверху нет.
  */
  const appSafeContentTop = insets.contentTop;
  const screenTopOffset = appSafeContentTop;
  const homeSafeTop = appSafeContentTop;
  const editorSafeTop = appSafeContentTop;
  const sheetTopLimit = appSafeContentTop;
  const editorControlsTop = appSafeContentTop;
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

  root.style.setProperty("--app-tg-used-top-fallback", "0");
  root.classList.toggle("tg-mobile", mobileTelegram);
  root.classList.toggle("tg-desktop", !mobileTelegram);
  root.classList.toggle("tg-phone-portrait", mobileTelegram && isPhonePortrait);
  root.classList.toggle("tg-phone-landscape", mobileTelegram && !isPhonePortrait);
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.remove("tg-safe-area-fallback");
  root.classList.add("tg-swipe-lock");

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen ?? false);
  root.dataset.tgOfficialContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgRawContentSafeTop = String(insets.rawContentTop);
  root.dataset.tgSafeAreaTop = String(insets.safeTop);
  root.dataset.tgCombinedSafeContentTop = String(insets.contentTop);
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
