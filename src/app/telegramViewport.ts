/**
 * Адаптер viewport для Telegram Mini App.
 *
 * Задачи модуля:
 * - сразу после запуска фиксировать высоту WebView в CSS-переменных;
 * - разворачивать Mini App на доступную высоту;
 * - отключать вертикальный свайп Telegram, который сворачивает приложение;
 * - повторять блокировку после событий Telegram, потому что на iOS/Android
 *   клиент иногда восстанавливает свайп после изменения viewport.
 */

type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramWebAppEvent = "viewportChanged";

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
    // На части клиентов доступен только официальный JS API WebApp.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        JSON.stringify({ eventType, eventData }),
        "https://web.telegram.org",
      );
    }
  } catch {
    // Web-клиент Telegram может запретить postMessage — это не критично.
  }
};

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (!tg || typeof navigator === "undefined") return false;

  const platform = tg.platform?.toLowerCase() ?? "";

  const isMobileTelegramPlatform =
    platform === "ios" || platform === "android" || platform === "android_x";

  const userAgent = navigator.userAgent.toLowerCase();

  const isRealMobileUserAgent =
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod") ||
    userAgent.includes("android") ||
    userAgent.includes("mobile");

  const isTouchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true;

  return isMobileTelegramPlatform || (isRealMobileUserAgent && isTouchDevice);
};

const getViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return Math.round(
    tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight,
  );
};

const getStableViewportHeight = (tg: TelegramWebApp | undefined) => {
  if (typeof window === "undefined") return 0;

  return Math.round(
    tg?.viewportStableHeight ?? window.visualViewport?.height ?? window.innerHeight,
  );
};

const updateTelegramViewportVars = () => {
  if (typeof document === "undefined") return;

  const tg = getTelegramWebApp();
  const root = document.documentElement;

  const viewportHeight = getViewportHeight(tg);
  const stableHeight = getStableViewportHeight(tg);

  const safeTop = Math.max(
    tg?.safeAreaInset?.top ?? 0,
    tg?.contentSafeAreaInset?.top ?? 0,
  );

  const safeBottom = Math.max(
    tg?.safeAreaInset?.bottom ?? 0,
    tg?.contentSafeAreaInset?.bottom ?? 0,
  );

  const mobileTelegram = isTelegramMobile(tg);
  const topNavigationSpace = mobileTelegram ? Math.max(96, safeTop + 76) : 0;

  root.style.setProperty("--app-height", `${viewportHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableHeight}px`);
  root.style.setProperty("--tg-safe-top", `${safeTop}px`);
  root.style.setProperty("--tg-safe-bottom", `${safeBottom}px`);
  root.style.setProperty("--tg-top-navigation-space", `${topNavigationSpace}px`);

  root.classList.toggle("tg-mobile", mobileTelegram);
  root.classList.add("tg-swipe-lock");
};

/**
 * Отключает нативный вертикальный свайп Telegram.
 *
 * Основной способ — WebApp.disableVerticalSwipes(). Дополнительно отправляем
 * низкоуровневое событие swipe_behavior как fallback для клиентов, где WebApp
 * объект появляется раньше/позже основного bridge.
 */
export const lockTelegramSwipeBehavior = () => {
  const tg = getTelegramWebApp();

  try {
    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    // Telegram bridge может быть ещё не готов на первом тике.
  }

  try {
    tg?.requestFullscreen?.();
  } catch {
    // Fullscreen поддерживается не на всех клиентах — приложение работает и без него.
  }

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });

  updateTelegramViewportVars();
};

/**
 * Мгновенный запуск блокировки до первого React-render.
 * Нужен, чтобы приложение не успевало закрыться свайпом в первые секунды.
 */
export const bootstrapTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  window.requestAnimationFrame?.(() => {
    lockTelegramSwipeBehavior();
  });
};

/** Инициализирует отслеживание viewport Telegram и возвращает функцию очистки. */
export const initTelegramViewport = () => {
  lockTelegramSwipeBehavior();

  const tg = getTelegramWebApp();
  const retryTimers = [50, 250, 700, 1500].map((delay) => {
    return window.setTimeout(() => {
      lockTelegramSwipeBehavior();
    }, delay);
  });

  const handleViewportUpdate = () => {
    lockTelegramSwipeBehavior();
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleViewportUpdate);
  document.addEventListener("visibilitychange", handleViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleViewportUpdate);
    document.removeEventListener("visibilitychange", handleViewportUpdate);
    document.documentElement.classList.remove("tg-mobile");
  };
};
