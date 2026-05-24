/**
 * Минимальный адаптер Telegram viewport / safe area.
 *
 * Что важно:
 * 1. Не рисуем фейковый верхний отступ 40/44px.
 * 2. Верх берём только из Telegram contentSafeAreaInset.top / CSS --tg-content-safe-area-inset-top.
 * 3. Высоту приложения НЕ уменьшаем во время клавиатуры, чтобы Home/Grid не прыгали.
 * 4. Клавиатуру отдаём отдельной переменной --tg-keyboard-offset для sheet-ов.
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
  disableVerticalSwipes?: () => void;
  isVersionAtLeast?: (version: string) => boolean;

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;
  isFullscreen?: boolean;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;

  onEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
  offEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
  TelegramWebviewProxy?: {
    postEvent?: (eventType: string, eventData: string) => void;
  };
};

const KEYBOARD_MIN_GAP = 80;
const DEFAULT_SHEET_TOP_LIMIT = 8;
const DEFAULT_SHEET_BOTTOM_GAP = 10;
const DEFAULT_TABBAR_BOTTOM_GAP = 10;

let appStableHeight = 0;
let rafId: number | null = null;
let prepared = false;

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

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!rawValue) return 0;

  return normalizePx(rawValue.replace("px", ""));
};

const postTelegramEvent = (eventType: string, eventData: Record<string, unknown>) => {
  if (typeof window === "undefined") return;

  const serializedData = JSON.stringify(eventData);
  const telegramWindow = window as TelegramWindow;

  try {
    telegramWindow.TelegramWebviewProxy?.postEvent?.(eventType, serializedData);
  } catch {
    // Telegram WebView может не дать прямой proxy — это нормально.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Web Telegram может запретить postMessage — это не критично.
  }
};

const requestTelegramSafeArea = () => {
  postTelegramEvent("web_app_request_safe_area", {});
  postTelegramEvent("web_app_request_content_safe_area", {});
};

const prepareTelegram = () => {
  if (prepared) return;

  prepared = true;
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    // Telegram bridge может быть не готов на первом кадре.
  }

  postTelegramEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });
};

const getInsets = (tg: TelegramWebApp | undefined) => {
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
  };
};

const getKeyboardOffset = () => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;
  if (!visualViewport) return 0;

  return normalizePx(
    Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop),
  );
};

const isKeyboardOpen = () => getKeyboardOffset() > KEYBOARD_MIN_GAP;

const getNextAppHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const candidate = normalizePx(
    Math.max(
      tg?.viewportStableHeight ?? 0,
      tg?.viewportHeight ?? 0,
      window.innerHeight ?? 0,
      document.documentElement.clientHeight ?? 0,
    ),
  );

  // Во время клавиатуры НЕ уменьшаем высоту приложения — иначе Home/Grid прыгают.
  if (appStableHeight <= 0) {
    appStableHeight = Math.max(candidate, 1);
  } else if (!isKeyboardOpen() && candidate > 0) {
    appStableHeight = candidate;
  }

  return appStableHeight;
};

const updateTelegramViewportVarsNow = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;
  const insets = getInsets(tg);
  const keyboardOffset = getKeyboardOffset();
  const appHeight = getNextAppHeight(tg);
  const safeBottom = Math.max(insets.safeBottom, insets.contentBottom, readCssPx("--safe-bottom"));

  setPxVar(root, "--app-height", appHeight);
  setPxVar(root, "--tg-viewport-height", normalizePx(tg?.viewportHeight ?? appHeight));
  setPxVar(root, "--tg-viewport-stable-height", appHeight);

  setPxVar(root, "--tg-keyboard-offset", keyboardOffset);
  setPxVar(root, "--sheet-keyboard-offset", keyboardOffset);
  setPxVar(root, "--app-keyboard-offset", keyboardOffset);

  setPxVar(root, "--app-tg-safe-area-inset-top", insets.safeTop);
  setPxVar(root, "--app-tg-safe-area-inset-right", insets.safeRight);
  setPxVar(root, "--app-tg-safe-area-inset-bottom", insets.safeBottom);
  setPxVar(root, "--app-tg-safe-area-inset-left", insets.safeLeft);

  setPxVar(root, "--app-tg-content-safe-area-inset-top", insets.contentTop);
  setPxVar(root, "--app-tg-content-safe-area-inset-right", insets.contentRight);
  setPxVar(root, "--app-tg-content-safe-area-inset-bottom", insets.contentBottom);
  setPxVar(root, "--app-tg-content-safe-area-inset-left", insets.contentLeft);

  // Алиасы для старых компонентов. Без fake fallback, только реальные данные Telegram.
  setPxVar(root, "--app-tg-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-safe-bottom", safeBottom);
  setPxVar(root, "--app-tg-screen-top-offset", insets.contentTop);
  setPxVar(root, "--app-home-safe-top", insets.contentTop);
  setPxVar(root, "--app-editor-safe-top", insets.contentTop);
  setPxVar(root, "--app-tg-editor-controls-top", Math.max(12, insets.contentTop));
  setPxVar(root, "--app-tg-sheet-top-limit", Math.max(DEFAULT_SHEET_TOP_LIMIT, insets.contentTop));
  setPxVar(root, "--app-tabbar-bottom-gap", Math.max(DEFAULT_TABBAR_BOTTOM_GAP, safeBottom + DEFAULT_TABBAR_BOTTOM_GAP));
  setPxVar(root, "--sheet-bottom-gap", Math.max(DEFAULT_SHEET_BOTTOM_GAP, safeBottom + DEFAULT_SHEET_BOTTOM_GAP));
  setPxVar(root, "--safe-top", insets.contentTop);
  setPxVar(root, "--safe-bottom", safeBottom);

  setPxVar(root, "--tg-safe-top", insets.contentTop);
  setPxVar(root, "--tg-safe-bottom", safeBottom);
  setPxVar(root, "--tg-top-navigation-space", insets.contentTop);

  root.classList.add("tg-swipe-lock");
  root.classList.toggle("tg-keyboard-open", keyboardOffset > KEYBOARD_MIN_GAP);

  root.dataset.tgPlatform = tg?.platform ?? "unknown";
  root.dataset.tgContentSafeTop = String(insets.contentTop);
  root.dataset.tgKeyboardOffset = String(keyboardOffset);

  window.dispatchEvent(new CustomEvent("app:telegram-viewport-change"));
};

const scheduleTelegramViewportUpdate = () => {
  if (typeof window === "undefined") return;

  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
  }

  rafId = window.requestAnimationFrame(() => {
    rafId = null;
    requestTelegramSafeArea();
    updateTelegramViewportVarsNow();
  });
};

export const lockTelegramSwipeBehavior = () => {
  prepareTelegram();
  requestTelegramSafeArea();
  updateTelegramViewportVarsNow();
};

export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  [0, 50, 150, 350, 700, 1200].forEach((delay) => {
    window.setTimeout(scheduleTelegramViewportUpdate, delay);
  });
};

export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const tg = getTelegramWebApp();
  const retryTimers = [50, 150, 350, 700, 1200, 2000].map((delay) => {
    return window.setTimeout(scheduleTelegramViewportUpdate, delay);
  });

  const handleViewportUpdate = () => {
    scheduleTelegramViewportUpdate();
  };

  const handleOrientationChange = () => {
    appStableHeight = 0;
    scheduleTelegramViewportUpdate();
    window.setTimeout(scheduleTelegramViewportUpdate, 260);
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

  return () => {
    retryTimers.forEach(window.clearTimeout);

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
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
  };
};
