/**
 * Telegram viewport/safe-area adapter.
 *
 * ВАЖНО: верхний отступ берём только из официальных Telegram safe-зон:
 *   safeAreaInset.top + contentSafeAreaInset.top
 *
 * Никаких ручных 44/52/64/96px fallback сверху здесь нет.
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

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
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

let stableViewportHeight = 0;
let viewportRafId: number | null = null;
let fullscreenRequested = false;

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

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown> | null) => {
  if (typeof window === "undefined") return;

  const message = JSON.stringify({ eventType, eventData });
  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Нативный bridge может быть недоступен вне Telegram.
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
  postTelegramWebEvent("web_app_request_safe_area", null);
  postTelegramWebEvent("web_app_request_content_safe_area", null);
};

const prepareTelegramWebApp = () => {
  const tg = getTelegramWebApp();

  tg?.ready?.();
  tg?.expand?.();
  tg?.disableVerticalSwipes?.();

  // Официальный fullscreen нужен, чтобы Telegram начал отдавать full-screen safe/content safe зоны.
  // Это не ручной отступ: сам offset всё равно берётся только из Telegram safeAreaInset/contentSafeAreaInset.
  if (!fullscreenRequested && tg?.isVersionAtLeast?.("8.0") === true && tg?.isFullscreen !== true) {
    fullscreenRequested = true;

    try {
      tg.requestFullscreen?.();
    } catch {
      // На части клиентов fullscreen может быть запрещён — тогда safe останется тем, что отдаёт Telegram.
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
    top: safeTop + contentTop,
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

  // Официальный верх: system safe + content safe. Без ручного fallback.
  setPxVar(root, "--app-tg-safe-top", insets.top);
  setPxVar(root, "--app-tg-screen-top-offset", insets.top);
  setPxVar(root, "--app-home-safe-top", insets.top);
  setPxVar(root, "--app-editor-safe-top", insets.top);
  setPxVar(root, "--app-tg-editor-controls-top", insets.top);
  setPxVar(root, "--app-tg-sheet-top-limit", insets.top);
  setPxVar(root, "--safe-top", insets.top);
  setPxVar(root, "--tg-safe-top", insets.top);
  setPxVar(root, "--tg-top-navigation-space", insets.top);

  setPxVar(root, "--app-tg-safe-bottom", insets.bottom);
  setPxVar(root, "--safe-bottom", insets.bottom);
  setPxVar(root, "--tg-safe-bottom", insets.bottom);
  setPxVar(root, "--app-tabbar-bottom-gap", Math.max(10, insets.bottom + 10));
  setPxVar(root, "--sheet-bottom-gap", Math.max(16, insets.bottom + 10));

  root.classList.add("tg-swipe-lock");
  root.classList.toggle("tg-keyboard-open", viewport.isKeyboardOpen);
  root.classList.toggle("tg-fullscreen", tg?.isFullscreen === true);

  root.dataset.tgIsFullscreen = String(tg?.isFullscreen === true);
  root.dataset.tgVersionAtLeast8 = String(tg?.isVersionAtLeast?.("8.0") === true);
  root.dataset.tgCssSafeTop = String(readCssPx("--tg-safe-area-inset-top"));
  root.dataset.tgApiSafeTop = String(normalizePx(tg?.safeAreaInset?.top));
  root.dataset.tgCssContentSafeTop = String(readCssPx("--tg-content-safe-area-inset-top"));
  root.dataset.tgApiContentSafeTop = String(normalizePx(tg?.contentSafeAreaInset?.top));
  root.dataset.tgOfficialTop = String(insets.top);
  root.dataset.tgKeyboardOffset = String(viewport.keyboardOffset);

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
    requestOfficialSafeAreas();
    updateTelegramViewportVars();
  });
};

/** Отключает нативный вертикальный свайп Telegram и обновляет viewport-переменные. */
export const lockTelegramSwipeBehavior = () => {
  ensureViewportFitCover();
  prepareTelegramWebApp();

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });

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
