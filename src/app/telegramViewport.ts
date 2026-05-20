/**
 * Адаптер viewport для Telegram Mini App.
 *
 * Важно:
 * - официальные CSS-переменные Telegram (`--tg-safe-area-inset-*` и
 *   `--tg-content-safe-area-inset-*`) НЕ переопределяем своими значениями;
 * - читаем их из computedStyle и/или из `Telegram.WebApp.safeAreaInset`;
 * - в приложение отдаём только свои alias-переменные `--app-tg-*`.
 *
 * Так Telegram остаётся источником правды, а мы не затираем content safe area нулями.
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
  | "fullscreenChanged";

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

const KEYBOARD_DETECTION_GAP = 72;
const CHROME_LOCK_THROTTLE_MS = 900;
const TG_CONTENT_SCREEN_GAP = 16;
const TG_CONTENT_SHEET_GAP = 8;

let stableAppHeight = 0;
let lastChromeLockAt = 0;

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === "undefined") return undefined;

  return (window as TelegramWindow).Telegram?.WebApp;
};

const normalizePx = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.round(value ?? 0));
};

const readCssPx = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return 0;

  const parsedValue = Number.parseFloat(rawValue.replace("px", ""));

  return normalizePx(parsedValue);
};

const getSafeInsetPx = (
  telegramValue: number | undefined,
  cssVariableName: string,
) => {
  /*
    Telegram может отдать значение двумя способами:
    1) через WebApp.safeAreaInset/contentSafeAreaInset;
    2) через официальную CSS-переменную.

    Берём максимум, но НИКОГДА не пишем обратно в официальную `--tg-*` переменную.
    Иначе можно затереть корректное значение нулём до прихода события Telegram.
  */
  return Math.max(normalizePx(telegramValue), readCssPx(cssVariableName));
};

const postTelegramWebEvent = (eventType: string, eventData: Record<string, unknown> | null) => {
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

const requestTelegramSafeAreas = () => {
  /*
    На клиентах Telegram Bot API 8.0+ safeAreaChanged/contentSafeAreaChanged
    приходят после запроса bridge-событий. Если клиент их не поддерживает,
    это безопасно проигнорируется.
  */
  postTelegramWebEvent("web_app_request_safe_area", null);
  postTelegramWebEvent("web_app_request_content_safe_area", null);
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

  const safeAreaTop = getSafeInsetPx(tg?.safeAreaInset?.top, "--tg-safe-area-inset-top");
  const safeAreaRight = getSafeInsetPx(tg?.safeAreaInset?.right, "--tg-safe-area-inset-right");
  const safeAreaBottom = getSafeInsetPx(tg?.safeAreaInset?.bottom, "--tg-safe-area-inset-bottom");
  const safeAreaLeft = getSafeInsetPx(tg?.safeAreaInset?.left, "--tg-safe-area-inset-left");

  const contentSafeAreaTop = getSafeInsetPx(
    tg?.contentSafeAreaInset?.top,
    "--tg-content-safe-area-inset-top",
  );
  const contentSafeAreaRight = getSafeInsetPx(
    tg?.contentSafeAreaInset?.right,
    "--tg-content-safe-area-inset-right",
  );
  const contentSafeAreaBottom = getSafeInsetPx(
    tg?.contentSafeAreaInset?.bottom,
    "--tg-content-safe-area-inset-bottom",
  );
  const contentSafeAreaLeft = getSafeInsetPx(
    tg?.contentSafeAreaInset?.left,
    "--tg-content-safe-area-inset-left",
  );

  const telegramSafeTop = normalizePx(safeAreaTop + contentSafeAreaTop);
  const telegramSafeRight = normalizePx(safeAreaRight + contentSafeAreaRight);
  const telegramSafeBottom = normalizePx(safeAreaBottom + contentSafeAreaBottom);
  const telegramSafeLeft = normalizePx(safeAreaLeft + contentSafeAreaLeft);

  const hasTelegramContentBounds =
    telegramSafeTop > 0 || telegramSafeBottom > 0 || telegramSafeLeft > 0 || telegramSafeRight > 0;

  const screenExtraGap = telegramSafeTop > 0 ? TG_CONTENT_SCREEN_GAP : 0;
  const sheetExtraGap = telegramSafeTop > 0 ? TG_CONTENT_SHEET_GAP : 0;
  const screenTopOffset = telegramSafeTop + screenExtraGap;
  const sheetTopLimit = telegramSafeTop + sheetExtraGap;

  /*
    Главное: app-height держим стабильным. Клавиатуру отдаём отдельной переменной,
    чтобы не двигался весь главный экран.
  */
  root.style.setProperty("--app-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight || stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-keyboard-offset", `${isKeyboardOpen ? keyboardInset : 0}px`);

  /*
    Собственные alias-переменные приложения. Официальные `--tg-*safe-area-inset-*`
    здесь не трогаем, чтобы не затереть значения Telegram.
  */
  root.style.setProperty("--app-tg-safe-area-inset-top", `${safeAreaTop}px`);
  root.style.setProperty("--app-tg-safe-area-inset-right", `${safeAreaRight}px`);
  root.style.setProperty("--app-tg-safe-area-inset-bottom", `${safeAreaBottom}px`);
  root.style.setProperty("--app-tg-safe-area-inset-left", `${safeAreaLeft}px`);

  root.style.setProperty("--app-tg-content-safe-area-inset-top", `${contentSafeAreaTop}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-right", `${contentSafeAreaRight}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-bottom", `${contentSafeAreaBottom}px`);
  root.style.setProperty("--app-tg-content-safe-area-inset-left", `${contentSafeAreaLeft}px`);

  root.style.setProperty("--app-tg-safe-top", `${telegramSafeTop}px`);
  root.style.setProperty("--app-tg-safe-right", `${telegramSafeRight}px`);
  root.style.setProperty("--app-tg-safe-bottom", `${telegramSafeBottom}px`);
  root.style.setProperty("--app-tg-safe-left", `${telegramSafeLeft}px`);

  root.style.setProperty("--app-screen-extra-gap", `${screenExtraGap}px`);
  root.style.setProperty("--app-sheet-extra-gap", `${sheetExtraGap}px`);
  root.style.setProperty("--app-tg-screen-top-offset", `${screenTopOffset}px`);
  root.style.setProperty("--app-tg-sheet-top-limit", `${sheetTopLimit}px`);
  root.style.setProperty("--app-tg-screen-right-offset", `${telegramSafeRight}px`);
  root.style.setProperty("--app-tg-screen-bottom-offset", `${telegramSafeBottom}px`);
  root.style.setProperty("--app-tg-screen-left-offset", `${telegramSafeLeft}px`);

  /* Старые alias оставляем только для совместимости компонентов, но это НЕ официальные TG vars. */
  root.style.setProperty("--tg-safe-area-top", `${safeAreaTop}px`);
  root.style.setProperty("--tg-content-safe-area-top", `${contentSafeAreaTop}px`);
  root.style.setProperty("--tg-safe-top", `${telegramSafeTop}px`);
  root.style.setProperty("--tg-safe-right", `${telegramSafeRight}px`);
  root.style.setProperty("--tg-safe-bottom", `${telegramSafeBottom}px`);
  root.style.setProperty("--tg-safe-left", `${telegramSafeLeft}px`);
  root.style.setProperty("--tg-screen-top-offset", `${screenTopOffset}px`);
  root.style.setProperty("--tg-sheet-top-limit", `${sheetTopLimit}px`);

  root.classList.toggle("tg-has-content-safe-area", hasTelegramContentBounds);
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
    // Telegram bridge может быть ещё не готов на первом тике.
  }

  try {
    if (canExpand && !document.documentElement.classList.contains("tg-keyboard-open")) {
      tg?.requestFullscreen?.();
    }
  } catch {
    // Fullscreen поддерживается не на всех клиентах — приложение работает и без него.
  }

  postTelegramWebEvent("web_app_setup_swipe_behavior", {
    allow_vertical_swipe: false,
  });
};

/** Отключает нативный вертикальный свайп Telegram и фиксирует стабильную высоту. */
export const lockTelegramSwipeBehavior = () => {
  requestTelegramSafeAreas();
  updateTelegramViewportVars({ allowStableResize: true });
  applyTelegramChromeLock({ expand: true });
  updateTelegramViewportVars({ allowStableResize: true });
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
    /*
      На resize от клавиатуры нельзя снова вызывать expand/requestFullscreen:
      Telegram WebView может дёрнуть весь экран. Обновляем только CSS-переменные.
    */
    updateTelegramViewportVars({ allowStableResize: false });
    applyTelegramChromeLock({ expand: false });
  };

  const handleStableViewportUpdate = () => {
    stableAppHeight = 0;
    lockTelegramSwipeBehavior();
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  tg?.onEvent?.("safeAreaChanged", handleStableViewportUpdate);
  tg?.onEvent?.("contentSafeAreaChanged", handleStableViewportUpdate);
  tg?.onEvent?.("fullscreenChanged", handleStableViewportUpdate);
  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.visualViewport?.addEventListener("scroll", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("orientationchange", handleStableViewportUpdate);
  document.addEventListener("visibilitychange", handleStableViewportUpdate);

  return () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    tg?.offEvent?.("safeAreaChanged", handleStableViewportUpdate);
    tg?.offEvent?.("contentSafeAreaChanged", handleStableViewportUpdate);
    tg?.offEvent?.("fullscreenChanged", handleStableViewportUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.visualViewport?.removeEventListener("scroll", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("orientationchange", handleStableViewportUpdate);
    document.removeEventListener("visibilitychange", handleStableViewportUpdate);
    document.documentElement.classList.remove("tg-has-content-safe-area", "tg-keyboard-open");
  };
};
