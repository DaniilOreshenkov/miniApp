/**
 * Telegram viewport / content safe-area adapter.
 *
 * Цель: получить настоящий Telegram contentSafeAreaInset.top по документации,
 * а не рисовать ручной верхний отступ.
 *
 * Почему здесь есть перехват bridge-событий:
 * Telegram может вернуть safe-area через низкоуровневое событие
 * `content_safe_area_changed`, но поле WebApp.contentSafeAreaInset не всегда
 * успевает обновиться к первому render. Поэтому мы читаем 3 официальных источника:
 * 1) Telegram.WebApp.contentSafeAreaInset.top
 * 2) CSS var(--tg-content-safe-area-inset-top)
 * 3) payload события content_safe_area_changed
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
  isVersionAtLeast?: (version: string) => boolean;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
  offEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  isFullscreen?: boolean;
  platform?: string;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
};

type TelegramBridgeEventReceiver = (eventType: string, eventData?: unknown) => void;

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
    WebView?: {
      receiveEvent?: TelegramBridgeEventReceiver;
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

type KeyboardMetrics = {
  viewportHeight: number;
  stableHeight: number;
  keyboardOffset: number;
  isKeyboardOpen: boolean;
};

type ParsedTelegramPayload = {
  eventType?: string;
  eventData?: unknown;
};

let stableViewportHeight = 0;
let viewportRafId: number | null = null;
let fullscreenRequested = false;
let messageListenerInstalled = false;
let capturedReceiveEvent: TelegramBridgeEventReceiver | null = null;
let rawSafeAreaInset: TelegramInset = {};
let rawContentSafeAreaInset: TelegramInset = {};
let lastSafeAreaEventSource = "none";

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
};

const normalizePx = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue));
};

const normalizeInset = (value: unknown): TelegramInset => {
  if (!value || typeof value !== "object") return {};

  const maybeInset = value as TelegramInset;

  return {
    top: normalizePx(maybeInset.top),
    right: normalizePx(maybeInset.right),
    bottom: normalizePx(maybeInset.bottom),
    left: normalizePx(maybeInset.left),
  };
};

const readCssPx = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!rawValue) return 0;
  return normalizePx(rawValue.replace("px", ""));
};

const setPxVar = (root: HTMLElement, name: string, value: number) => {
  root.style.setProperty(name, `${normalizePx(value)}px`);
};

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const parseTelegramMessage = (value: unknown): ParsedTelegramPayload | null => {
  const parsedValue = parseMaybeJson(value);

  if (!parsedValue || typeof parsedValue !== "object") return null;

  const maybePayload = parsedValue as ParsedTelegramPayload;
  if (typeof maybePayload.eventType !== "string") return null;

  return maybePayload;
};

const extractInsetFromEventData = (eventData: unknown): TelegramInset => {
  const parsedData = parseMaybeJson(eventData);

  if (!parsedData || typeof parsedData !== "object") return {};

  const data = parsedData as Record<string, unknown>;

  return normalizeInset(
    data.content_safe_area ??
      data.contentSafeAreaInset ??
      data.content_safe_area_inset ??
      data.safe_area ??
      data.safeAreaInset ??
      data.safe_area_inset ??
      data,
  );
};

const scheduleViewportUpdate = () => {
  if (typeof window === "undefined") return;

  if (viewportRafId !== null) {
    window.cancelAnimationFrame(viewportRafId);
  }

  viewportRafId = window.requestAnimationFrame(() => {
    viewportRafId = null;
    installBridgeEventCapture();
    prepareTelegramWebApp();
    requestOfficialSafeAreas();
    updateTelegramViewportVars();
  });
};

const handleTelegramBridgeEvent = (eventType: string, eventData?: unknown) => {
  const normalizedEventType = eventType.replace(/([A-Z])/g, "_$1").toLowerCase();

  if (normalizedEventType === "content_safe_area_changed") {
    rawContentSafeAreaInset = extractInsetFromEventData(eventData);
    lastSafeAreaEventSource = "content_safe_area_changed";
    scheduleViewportUpdate();
    return;
  }

  if (normalizedEventType === "safe_area_changed") {
    rawSafeAreaInset = extractInsetFromEventData(eventData);
    lastSafeAreaEventSource = "safe_area_changed";
    scheduleViewportUpdate();
  }
};

function installBridgeEventCapture() {
  if (typeof window === "undefined") return;

  const telegramWindow = window as TelegramWindow;
  telegramWindow.Telegram = telegramWindow.Telegram ?? {};
  telegramWindow.Telegram.WebView = telegramWindow.Telegram.WebView ?? {};

  const webView = telegramWindow.Telegram.WebView;

  if (webView.receiveEvent !== capturedReceiveEvent) {
    const previousReceiveEvent = webView.receiveEvent;

    capturedReceiveEvent = (eventType: string, eventData?: unknown) => {
      handleTelegramBridgeEvent(eventType, eventData);
      previousReceiveEvent?.(eventType, eventData);
    };

    webView.receiveEvent = capturedReceiveEvent;
  }

  if (!messageListenerInstalled) {
    messageListenerInstalled = true;

    window.addEventListener("message", (event) => {
      const payload = parseTelegramMessage(event.data);
      if (!payload?.eventType) return;

      handleTelegramBridgeEvent(payload.eventType, payload.eventData);
    });
  }
}

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown> | null) => {
  if (typeof window === "undefined") return;

  const message = JSON.stringify({ eventType, eventData });
  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Native bridge может быть недоступен вне Telegram.
  }

  try {
    telegramWindow.webkit?.messageHandlers?.TelegramWebviewProxy?.postMessage?.(message);
  } catch {
    // iOS bridge может отсутствовать.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, "https://web.telegram.org");
    }
  } catch {
    // Web-клиент может запретить postMessage.
  }
};

const ensureViewportFitCover = () => {
  if (typeof document === "undefined") return;

  const selector = 'meta[name="viewport"]';
  const currentMeta = document.querySelector<HTMLMetaElement>(selector);
  const content = currentMeta?.content ?? "width=device-width, initial-scale=1.0";

  if (content.includes("viewport-fit=cover")) return;

  const nextContent = `${content.replace(/,?\s*viewport-fit=[^,]+/g, "")}, viewport-fit=cover`;

  if (currentMeta) {
    currentMeta.content = nextContent;
    return;
  }

  const nextMeta = document.createElement("meta");
  nextMeta.name = "viewport";
  nextMeta.content = nextContent;
  document.head.appendChild(nextMeta);
};

const requestOfficialSafeAreas = () => {
  // В официальном bridge payload для request-событий должен быть null.
  postTelegramWebEvent("web_app_request_safe_area", null);
  postTelegramWebEvent("web_app_request_content_safe_area", null);
};

const prepareTelegramWebApp = () => {
  const tg = getTelegramWebApp();

  tg?.ready?.();
  tg?.expand?.();
  tg?.disableVerticalSwipes?.();

  // contentSafeAreaInset.top особенно важен в fullscreen-режиме,
  // где Telegram UI может находиться поверх WebView.
  if (!fullscreenRequested && tg?.isVersionAtLeast?.("8.0") === true && tg?.isFullscreen !== true) {
    fullscreenRequested = true;

    try {
      tg.requestFullscreen?.();
    } catch {
      // Клиент может отказать во fullscreen. Тогда используем то, что отдаёт Telegram.
    }
  }
};

const getCurrentViewportHeight = (tg: TelegramWebApp | undefined) => {
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

const getKeyboardMetrics = (tg: TelegramWebApp | undefined): KeyboardMetrics => {
  const viewportHeight = getCurrentViewportHeight(tg);
  const potentialStableHeight = getPotentialStableHeight(tg);

  stableViewportHeight = Math.max(stableViewportHeight, potentialStableHeight, viewportHeight);

  const visualBottom = getVisualBottom();
  const keyboardOffset = normalizePx(
    Math.max(0, stableViewportHeight - Math.max(viewportHeight, visualBottom)),
  );

  return {
    viewportHeight,
    stableHeight: Math.max(stableViewportHeight, viewportHeight, 1),
    keyboardOffset,
    isKeyboardOpen: keyboardOffset > 72,
  };
};

const getOfficialInsets = (tg: TelegramWebApp | undefined) => {
  const safeTop = Math.max(
    readCssPx("--tg-safe-area-inset-top"),
    normalizePx(tg?.safeAreaInset?.top),
    normalizePx(rawSafeAreaInset.top),
  );
  const safeRight = Math.max(
    readCssPx("--tg-safe-area-inset-right"),
    normalizePx(tg?.safeAreaInset?.right),
    normalizePx(rawSafeAreaInset.right),
  );
  const safeBottom = Math.max(
    readCssPx("--tg-safe-area-inset-bottom"),
    normalizePx(tg?.safeAreaInset?.bottom),
    normalizePx(rawSafeAreaInset.bottom),
  );
  const safeLeft = Math.max(
    readCssPx("--tg-safe-area-inset-left"),
    normalizePx(tg?.safeAreaInset?.left),
    normalizePx(rawSafeAreaInset.left),
  );

  const contentTop = Math.max(
    readCssPx("--tg-content-safe-area-inset-top"),
    normalizePx(tg?.contentSafeAreaInset?.top),
    normalizePx(rawContentSafeAreaInset.top),
  );
  const contentRight = Math.max(
    readCssPx("--tg-content-safe-area-inset-right"),
    normalizePx(tg?.contentSafeAreaInset?.right),
    normalizePx(rawContentSafeAreaInset.right),
  );
  const contentBottom = Math.max(
    readCssPx("--tg-content-safe-area-inset-bottom"),
    normalizePx(tg?.contentSafeAreaInset?.bottom),
    normalizePx(rawContentSafeAreaInset.bottom),
  );
  const contentLeft = Math.max(
    readCssPx("--tg-content-safe-area-inset-left"),
    normalizePx(tg?.contentSafeAreaInset?.left),
    normalizePx(rawContentSafeAreaInset.left),
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
    bottom: Math.max(safeBottom, contentBottom),
  };
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const viewport = getKeyboardMetrics(tg);
  const insets = getOfficialInsets(tg);

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
  setPxVar(root, "--app-tg-content-safe-area-inset-top-raw", insets.contentTop);

  // Верх делаем строго через contentSafeAreaInset.top.
  // Это именно Telegram content safe top, а не ручной fallback.
  setPxVar(root, "--app-tg-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-screen-top-offset", insets.contentTop);
  setPxVar(root, "--app-home-safe-top", insets.contentTop);
  setPxVar(root, "--app-editor-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-editor-controls-top", insets.contentTop);
  setPxVar(root, "--app-tg-sheet-top-limit", insets.contentTop);
  setPxVar(root, "--safe-top", insets.contentTop);
  setPxVar(root, "--tg-safe-top", insets.contentTop);
  setPxVar(root, "--tg-top-navigation-space", insets.contentTop);

  setPxVar(root, "--app-tg-safe-bottom", insets.bottom);
  setPxVar(root, "--safe-bottom", insets.bottom);
  setPxVar(root, "--tg-safe-bottom", insets.bottom);
  setPxVar(root, "--app-tabbar-bottom-gap", insets.contentBottom + 10);
  setPxVar(root, "--sheet-bottom-gap", Math.max(16, insets.contentBottom + 10));

  const viewportWidth = normalizePx(window.innerWidth || document.documentElement.clientWidth || 0);
  const adaptiveHeight = viewport.stableHeight;
  const shortSide = Math.min(viewportWidth, adaptiveHeight);
  const longSide = Math.max(viewportWidth, adaptiveHeight);
  const isPhoneViewport = shortSide <= 600 && longSide <= 1200;

  setPxVar(root, "--app-viewport-width", viewportWidth);
  setPxVar(root, "--app-viewport-height", adaptiveHeight);
  setPxVar(root, "--app-short-side", shortSide);
  setPxVar(root, "--app-long-side", longSide);

  root.classList.add("tg-swipe-lock");
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.toggle("tg-fullscreen", tg?.isFullscreen === true);
  root.classList.toggle("app-device-phone", isPhoneViewport);
  root.classList.toggle("app-width-xs", isPhoneViewport && shortSide <= 360);
  root.classList.toggle("app-width-sm", isPhoneViewport && shortSide > 360 && shortSide <= 390);
  root.classList.toggle("app-height-xs", isPhoneViewport && adaptiveHeight <= 640);
  root.classList.toggle("app-height-sm", isPhoneViewport && adaptiveHeight > 640 && adaptiveHeight <= 700);
  root.classList.toggle("app-height-md", isPhoneViewport && adaptiveHeight > 700 && adaptiveHeight <= 780);
  root.classList.toggle("app-height-lg", isPhoneViewport && adaptiveHeight > 780);

  root.dataset.appViewportWidth = String(viewportWidth);
  root.dataset.appViewportHeight = String(adaptiveHeight);
  root.dataset.appShortSide = String(shortSide);
  root.dataset.appLongSide = String(longSide);
  root.dataset.appDevicePhone = String(isPhoneViewport);
  root.dataset.tgIsFullscreen = String(tg?.isFullscreen === true);
  root.dataset.tgVersionAtLeast8 = String(tg?.isVersionAtLeast?.("8.0") === true);
  root.dataset.tgCssContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgEventContentSafeTop = String(normalizePx(rawContentSafeAreaInset.top));
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgCssSafeTop = String(readCssPx("--tg-safe-area-inset-top"));
  root.dataset.tgApiSafeTop = String(normalizePx(tg?.safeAreaInset?.top));
  root.dataset.tgEventSafeTop = String(normalizePx(rawSafeAreaInset.top));
  root.dataset.tgLastSafeAreaEvent = lastSafeAreaEventSource;
  root.dataset.tgKeyboardOffset = String(viewport.keyboardOffset);

  window.dispatchEvent(new CustomEvent("app:telegram-viewport-change"));
};

/** Отключает нативный вертикальный свайп Telegram и обновляет viewport-переменные. */
export const lockTelegramSwipeBehavior = () => {
  ensureViewportFitCover();
  installBridgeEventCapture();
  prepareTelegramWebApp();
  requestOfficialSafeAreas();
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
    document.documentElement.classList.remove("tg-keyboard-open", "tg-fullscreen");
  };
};
