/**
 * Адаптер viewport для Telegram Mini App.
 *
 * Важно для клавиатуры: `--app-height` держим стабильным и НЕ уменьшаем его
 * на каждом visualViewport resize. Иначе браузер пересчитывает весь главный
 * экран, и при фокусе input двигается не только sheet, но и Home/Grid.
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
    Telegram отдаёт safeAreaInset/contentSafeAreaInset не во всех клиентах сразу.
    Просим оба события официальными web events и дальше слушаем safeAreaChanged/contentSafeAreaChanged.
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

  const safeAreaTop = normalizePx(tg?.safeAreaInset?.top ?? 0);
  const safeAreaRight = normalizePx(tg?.safeAreaInset?.right ?? 0);
  const safeAreaBottom = normalizePx(tg?.safeAreaInset?.bottom ?? 0);
  const safeAreaLeft = normalizePx(tg?.safeAreaInset?.left ?? 0);

  const contentSafeAreaTop = normalizePx(tg?.contentSafeAreaInset?.top ?? 0);
  const contentSafeAreaRight = normalizePx(tg?.contentSafeAreaInset?.right ?? 0);
  const contentSafeAreaBottom = normalizePx(tg?.contentSafeAreaInset?.bottom ?? 0);
  const contentSafeAreaLeft = normalizePx(tg?.contentSafeAreaInset?.left ?? 0);

  /*
    Важно: больше не угадываем desktop/mobile и не добавляем ручной резерв под
    кнопку Telegram. Telegram WebApp API сам отдаёт две зоны:
    - safeAreaInset: физическая safe-area устройства;
    - contentSafeAreaInset: зона, которую Telegram может перекрывать своими UI.

    Поэтому верх для контента = safe + content + наш маленький дизайн-gap.
    На desktop, где Telegram отдаёт 0, отступ тоже будет 0.
  */
  const telegramSafeTop = normalizePx(safeAreaTop + contentSafeAreaTop);
  const telegramSafeRight = normalizePx(safeAreaRight + contentSafeAreaRight);
  const telegramSafeBottom = normalizePx(safeAreaBottom + contentSafeAreaBottom);
  const telegramSafeLeft = normalizePx(safeAreaLeft + contentSafeAreaLeft);

  const hasTelegramContentBounds =
    telegramSafeTop > 0 || telegramSafeBottom > 0 || telegramSafeLeft > 0 || telegramSafeRight > 0;

  /*
    Дополнительные дизайн-отступы включаем только когда Telegram реально отдал
    safe/content safe area. На desktop, где оба inset = 0, лишнего отступа нет.
  */
  const screenExtraGap = telegramSafeTop > 0 ? TG_CONTENT_SCREEN_GAP : 0;
  const sheetExtraGap = telegramSafeTop > 0 ? TG_CONTENT_SHEET_GAP : 0;
  const screenTopOffset = telegramSafeTop + screenExtraGap;
  const sheetTopLimit = telegramSafeTop + sheetExtraGap;

  /*
    Главное: app-height всегда стабильный. Реальную высоту с клавиатурой
    отдаём отдельно в --tg-viewport-height и --tg-keyboard-offset.
  */
  root.style.setProperty("--app-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-height", `${viewportHeight || stableAppHeight}px`);
  root.style.setProperty("--tg-viewport-stable-height", `${stableAppHeight}px`);
  root.style.setProperty("--tg-keyboard-offset", `${isKeyboardOpen ? keyboardInset : 0}px`);
  root.style.setProperty("--tg-safe-area-inset-top", `${safeAreaTop}px`);
  root.style.setProperty("--tg-safe-area-inset-right", `${safeAreaRight}px`);
  root.style.setProperty("--tg-safe-area-inset-bottom", `${safeAreaBottom}px`);
  root.style.setProperty("--tg-safe-area-inset-left", `${safeAreaLeft}px`);

  root.style.setProperty("--tg-content-safe-area-inset-top", `${contentSafeAreaTop}px`);
  root.style.setProperty("--tg-content-safe-area-inset-right", `${contentSafeAreaRight}px`);
  root.style.setProperty("--tg-content-safe-area-inset-bottom", `${contentSafeAreaBottom}px`);
  root.style.setProperty("--tg-content-safe-area-inset-left", `${contentSafeAreaLeft}px`);

  root.style.setProperty("--tg-safe-top", `${telegramSafeTop}px`);
  root.style.setProperty("--tg-safe-right", `${telegramSafeRight}px`);
  root.style.setProperty("--tg-safe-bottom", `${telegramSafeBottom}px`);
  root.style.setProperty("--tg-safe-left", `${telegramSafeLeft}px`);

  root.style.setProperty("--tg-screen-extra-gap", `${screenExtraGap}px`);
  root.style.setProperty("--tg-sheet-extra-gap", `${sheetExtraGap}px`);
  root.style.setProperty("--tg-screen-top-offset", `${screenTopOffset}px`);
  root.style.setProperty("--tg-sheet-top-limit", `${sheetTopLimit}px`);
  root.style.setProperty("--tg-screen-right-offset", `${telegramSafeRight}px`);
  root.style.setProperty("--tg-screen-bottom-offset", `${telegramSafeBottom}px`);
  root.style.setProperty("--tg-screen-left-offset", `${telegramSafeLeft}px`);

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
