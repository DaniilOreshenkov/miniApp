/**
 * Telegram viewport / content safe-area adapter.
 *
 * Важное правило проекта:
 * - фон приложения живёт от самого верха WebView;
 * - контент двигается только через Telegram contentSafeAreaInset;
 * - никаких ручных 44/64/96px и никаких +10 сверху.
 */

type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
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
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
  offEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;

  viewportHeight?: number;
  viewportStableHeight?: number;
  isFullscreen?: boolean;
  platform?: string;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
};

type TelegramBridgeReceiver = (eventType: string, eventData?: unknown) => void;

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
    WebView?: {
      receiveEvent?: TelegramBridgeReceiver;
    };
  };
  TelegramWebviewProxy?: {
    postEvent?: (eventType: string, eventData: string) => void;
  };
  webkit?: {
    messageHandlers?: {
      TelegramWebviewProxy?: {
        postMessage?: (message: string) => void;
      };
    };
  };
};

const KEYBOARD_DETECTION_GAP = 72;

let stableViewportHeight = 0;
let viewportRafId: number | null = null;
let fullscreenRequested = false;
let bridgePatched = false;
let originalReceiveEvent: TelegramBridgeReceiver | undefined;
let eventContentSafeAreaInset: TelegramInset = {};
let eventSafeAreaInset: TelegramInset = {};
let lastSafeAreaEvent = "none";

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
};

const normalizePx = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue));
};

const setPxVar = (root: HTMLElement, name: string, value: number) => {
  root.style.setProperty(name, `${normalizePx(value)}px`);
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

const isTelegramDesktop = (tg: TelegramWebApp | undefined) => {
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

const isPhonePortraitViewport = () => {
  if (typeof window === "undefined") return false;

  const shortestSide = Math.min(window.innerWidth, window.innerHeight);
  const longestSide = Math.max(window.innerWidth, window.innerHeight);

  return window.innerHeight >= window.innerWidth && shortestSide <= 600 && longestSide <= 1200;
};

const postTelegramEvent = (eventType: string, eventData: unknown = null) => {
  if (typeof window === "undefined") return;

  const telegramWindow = window as TelegramWindow;
  const serializedData = JSON.stringify(eventData);

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // На части клиентов этот bridge недоступен.
  }

  try {
    telegramWindow.webkit?.messageHandlers?.TelegramWebviewProxy?.postMessage?.(
      JSON.stringify({ eventType, eventData }),
    );
  } catch {
    // iOS WebKit bridge может быть недоступен вне Telegram.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(JSON.stringify({ eventType, eventData }), "https://web.telegram.org");
    }
  } catch {
    // Web Telegram может запретить postMessage.
  }
};

const requestTelegramSafeAreas = () => {
  postTelegramEvent("web_app_request_safe_area", null);
  postTelegramEvent("web_app_request_content_safe_area", null);
};

const readInsetPayload = (eventData: unknown): TelegramInset => {
  if (!eventData || typeof eventData !== "object") return {};

  const payload = eventData as Record<string, unknown>;
  const source =
    payload.safe_area && typeof payload.safe_area === "object"
      ? (payload.safe_area as Record<string, unknown>)
      : payload.content_safe_area && typeof payload.content_safe_area === "object"
        ? (payload.content_safe_area as Record<string, unknown>)
        : payload;

  return {
    top: normalizePx(source.top),
    right: normalizePx(source.right),
    bottom: normalizePx(source.bottom),
    left: normalizePx(source.left),
  };
};

const handleBridgeEvent = (eventType: string, eventData?: unknown) => {
  if (eventType === "content_safe_area_changed" || eventType === "contentSafeAreaChanged") {
    eventContentSafeAreaInset = readInsetPayload(eventData);
    lastSafeAreaEvent = eventType;
    scheduleViewportUpdate();
    return;
  }

  if (eventType === "safe_area_changed" || eventType === "safeAreaChanged") {
    eventSafeAreaInset = readInsetPayload(eventData);
    lastSafeAreaEvent = eventType;
    scheduleViewportUpdate();
  }
};

const installBridgeEventCapture = () => {
  if (typeof window === "undefined" || bridgePatched) return;

  const telegramWindow = window as TelegramWindow;
  const webView = telegramWindow.Telegram?.WebView;
  if (webView?.receiveEvent) {
    originalReceiveEvent = webView.receiveEvent;
    webView.receiveEvent = (eventType, eventData) => {
      handleBridgeEvent(eventType, eventData);
      originalReceiveEvent?.(eventType, eventData);
    };
  }

  window.addEventListener("message", (event) => {
    const rawData = event.data;
    if (typeof rawData !== "string") return;

    try {
      const parsed = JSON.parse(rawData) as { eventType?: string; eventData?: unknown };
      if (parsed.eventType) handleBridgeEvent(parsed.eventType, parsed.eventData);
    } catch {
      // Игнорируем чужие сообщения.
    }
  });

  bridgePatched = true;
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

  if (!fullscreenRequested) {
    fullscreenRequested = true;

    try {
      tg?.requestFullscreen?.();
    } catch {
      // Fullscreen есть только на клиентах Bot API 8.0+.
    }
  }

  try {
    postTelegramEvent("web_app_setup_swipe_behavior", { allow_vertical_swipe: false });
  } catch {
    // Не критично для safe-area.
  }

  return tg;
};

const getViewportHeight = (tg: TelegramWebApp | undefined) => {
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
      window.visualViewport?.height ?? 0,
      tg?.viewportHeight ?? 0,
    ),
  );
};

const getVisualBottom = () => {
  if (typeof window === "undefined") return 0;
  const visualViewport = window.visualViewport;
  if (!visualViewport) return window.innerHeight;
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

const getOfficialInsets = (tg: TelegramWebApp | undefined) => {
  const safeTop = Math.max(
    readCssPx("--tg-safe-area-inset-top"),
    normalizePx(tg?.safeAreaInset?.top),
    normalizePx(eventSafeAreaInset.top),
  );
  const safeRight = Math.max(
    readCssPx("--tg-safe-area-inset-right"),
    normalizePx(tg?.safeAreaInset?.right),
    normalizePx(eventSafeAreaInset.right),
  );
  const safeBottom = Math.max(
    readCssPx("--tg-safe-area-inset-bottom"),
    normalizePx(tg?.safeAreaInset?.bottom),
    normalizePx(eventSafeAreaInset.bottom),
  );
  const safeLeft = Math.max(
    readCssPx("--tg-safe-area-inset-left"),
    normalizePx(tg?.safeAreaInset?.left),
    normalizePx(eventSafeAreaInset.left),
  );

  const contentTop = Math.max(
    readCssPx("--tg-content-safe-area-inset-top"),
    normalizePx(tg?.contentSafeAreaInset?.top),
    normalizePx(eventContentSafeAreaInset.top),
  );
  const contentRight = Math.max(
    readCssPx("--tg-content-safe-area-inset-right"),
    normalizePx(tg?.contentSafeAreaInset?.right),
    normalizePx(eventContentSafeAreaInset.right),
  );
  const contentBottom = Math.max(
    readCssPx("--tg-content-safe-area-inset-bottom"),
    normalizePx(tg?.contentSafeAreaInset?.bottom),
    normalizePx(eventContentSafeAreaInset.bottom),
  );
  const contentLeft = Math.max(
    readCssPx("--tg-content-safe-area-inset-left"),
    normalizePx(tg?.contentSafeAreaInset?.left),
    normalizePx(eventContentSafeAreaInset.left),
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
  };
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewport = getKeyboardMetrics(tg);
  const insets = getOfficialInsets(tg);
  const contentBottom = insets.contentBottom;

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
  setPxVar(root, "--app-tg-content-safe-area-inset-bottom", contentBottom);
  setPxVar(root, "--app-tg-content-safe-area-inset-left", insets.contentLeft);
  setPxVar(root, "--app-tg-content-safe-area-inset-top-raw", insets.contentTop);

  // Backward-compatible aliases. Все верхние alias равны только contentSafeAreaInset.top.
  setPxVar(root, "--app-tg-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-screen-top-offset", insets.contentTop);
  setPxVar(root, "--app-home-safe-top", insets.contentTop);
  setPxVar(root, "--app-editor-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-editor-controls-top", insets.contentTop);
  setPxVar(root, "--app-tg-sheet-top-limit", insets.contentTop);
  setPxVar(root, "--safe-top", insets.contentTop);
  setPxVar(root, "--tg-safe-top", insets.contentTop);
  setPxVar(root, "--tg-top-navigation-space", insets.contentTop);

  // Для контента снизу используем contentSafeAreaInset.bottom. Фон при этом остаётся на весь экран.
  setPxVar(root, "--app-tg-safe-bottom", contentBottom);
  setPxVar(root, "--app-tabbar-bottom-gap", contentBottom);
  setPxVar(root, "--sheet-bottom-gap", contentBottom);
  setPxVar(root, "--safe-bottom", contentBottom);
  setPxVar(root, "--tg-safe-bottom", contentBottom);

  root.classList.toggle("tg-mobile", !isTelegramDesktop(tg));
  root.classList.toggle("tg-desktop", isTelegramDesktop(tg));
  root.classList.toggle("tg-phone-portrait", isPhonePortraitViewport());
  root.classList.toggle("tg-phone-landscape", !isPhonePortraitViewport());
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.add("tg-swipe-lock");

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgVersionAtLeast8 = String(tg?.isVersionAtLeast?.("8.0") ?? false);
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen ?? false);
  root.dataset.tgCssContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgEventContentSafeTop = String(normalizePx(eventContentSafeAreaInset.top));
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgCssSafeTop = String(readCssPx("--tg-safe-area-inset-top"));
  root.dataset.tgApiSafeTop = String(normalizePx(tg?.safeAreaInset?.top));
  root.dataset.tgSafeTop = String(insets.safeTop);
  root.dataset.tgContentSafeBottom = String(contentBottom);
  root.dataset.tgLastSafeAreaEvent = lastSafeAreaEvent;

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
  installBridgeEventCapture();
  prepareTelegramWebApp();
  requestTelegramSafeAreas();
  updateTelegramViewportVars();
};

/** Мгновенный запуск до первого React-render. */
export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  [0, 50, 150, 350, 700, 1200, 2000].forEach((delay) => {
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
    document.documentElement.classList.remove(
      "tg-mobile",
      "tg-desktop",
      "tg-phone-portrait",
      "tg-phone-landscape",
      "tg-keyboard-open",
      "tg-swipe-lock",
    );
  };
};
