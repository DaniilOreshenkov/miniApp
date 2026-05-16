/**
 * Адаптер viewport для Telegram.
 *
 * Telegram Mini Apps работают внутри WebView с динамической высотой экрана
 * и safe-area зонами. Этот модуль нормализует эти значения в CSS-переменные,
 * которые использует интерфейс.
 */

type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;

  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;

  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;

  onEvent?: (eventType: "viewportChanged", eventHandler: () => void) => void;
  offEvent?: (eventType: "viewportChanged", eventHandler: () => void) => void;
};

const getTelegramWebApp = (): TelegramWebApp | undefined => {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram?.WebApp;
};

const isTelegramMobile = (tg: TelegramWebApp | undefined) => {
  if (!tg) return false;

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

const updateTelegramViewportVars = () => {
  const tg = getTelegramWebApp();
  const root = document.documentElement;

  const viewportHeight =
    tg?.viewportHeight ?? window.visualViewport?.height ?? window.innerHeight;

  const stableHeight =
    tg?.viewportStableHeight ??
    window.visualViewport?.height ??
    window.innerHeight;

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
  root.style.setProperty(
    "--tg-top-navigation-space",
    `${topNavigationSpace}px`,
  );

  root.classList.toggle("tg-mobile", mobileTelegram);
};

/** Инициализирует отслеживание viewport Telegram и возвращает функцию очистки. */
export const initTelegramViewport = () => {
  const tg = getTelegramWebApp();

  tg?.ready?.();
  tg?.expand?.();
  tg?.disableVerticalSwipes?.();

  try {
    tg?.requestFullscreen?.();
  } catch {
    // Telegram может не разрешить fullscreen на некоторых платформах.
  }

  updateTelegramViewportVars();

  const handleViewportUpdate = () => {
    updateTelegramViewportVars();
  };

  tg?.onEvent?.("viewportChanged", handleViewportUpdate);
  window.visualViewport?.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("resize", handleViewportUpdate);

  return () => {
    tg?.offEvent?.("viewportChanged", handleViewportUpdate);
    window.visualViewport?.removeEventListener("resize", handleViewportUpdate);
    window.removeEventListener("resize", handleViewportUpdate);
    document.documentElement.classList.remove("tg-mobile");
  };
};
