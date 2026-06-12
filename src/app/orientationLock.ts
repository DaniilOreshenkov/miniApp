/**
 * Блокировка горизонтального режима для Telegram Mini App.
 *
 * Что делает:
 * - если приложение открыто вертикально — просим Telegram зафиксировать текущую ориентацию;
 * - если пользователь всё равно попал в landscape — показываем поверх приложения экран с просьбой повернуть телефон;
 * - не трогаем safe-area, клавиатуру, layout, HomeScreen и редактор.
 */

type TelegramWebAppWithOrientation = {
  isVersionAtLeast?: (version: string) => boolean;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  isOrientationLocked?: boolean;
  platform?: string;
  initData?: string;
};

type TelegramOrientationWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebAppWithOrientation;
  };
};

const LANDSCAPE_CLASS = "tg-landscape-blocked";
const STYLE_ID = "tg-orientation-lock-style";
const OVERLAY_ID = "tg-orientation-lock-overlay";

let isBootstrapped = false;
let lockAttemptedInPortrait = false;
let orientationRafId: number | null = null;

const getTelegramWebApp = () => {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramOrientationWindow).Telegram?.WebApp;
};

// Блокировка ориентации нужна только в мобильном клиенте Telegram (ios/android).
// В обычном вебе и на десктопе окно почти всегда «landscape», поэтому блокер
// ломал бы веб-версию — там приложение должно работать в любой ориентации.
const isMobileTelegramClient = () => {
  const tg = getTelegramWebApp();
  if (!tg) return false;
  const hasInitData = typeof tg.initData === "string" && tg.initData.length > 0;
  const isMobile = tg.platform === "ios" || tg.platform === "android";
  return hasInitData && isMobile;
};

const canUseTelegramOrientationLock = (tg: TelegramWebAppWithOrientation | undefined) => {
  if (!tg || typeof tg.lockOrientation !== "function") return false;

  try {
    return tg.isVersionAtLeast?.("8.0") !== false;
  } catch {
    return true;
  }
};

const isLandscapeViewport = () => {
  if (typeof window === "undefined") return false;

  const mediaLandscape = window.matchMedia?.("(orientation: landscape)").matches === true;
  const sizeLandscape = window.innerWidth > window.innerHeight;

  return mediaLandscape || sizeLandscape;
};

const ensureOrientationStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html.${LANDSCAPE_CLASS},
    html.${LANDSCAPE_CLASS} body,
    html.${LANDSCAPE_CLASS} #root {
      overflow: hidden !important;
      touch-action: none !important;
    }

    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      padding: max(24px, env(safe-area-inset-top, 0px)) 24px max(24px, env(safe-area-inset-bottom, 0px));
      background: var(--bg, #0b0e14);
      color: var(--text-primary, #f7f7fb);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
      text-align: center;
      box-sizing: border-box;
    }

    html.${LANDSCAPE_CLASS} #${OVERLAY_ID} {
      display: flex;
    }

    #${OVERLAY_ID} .tg-orientation-lock-card {
      width: min(360px, 100%);
      border-radius: 28px;
      padding: 28px 22px;
      background: var(--surface-strong, rgba(21, 24, 32, 0.96));
      box-shadow: var(--shadow-sheet, 0 20px 50px rgba(0, 0, 0, 0.36));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    }

    #${OVERLAY_ID} .tg-orientation-lock-icon {
      width: 54px;
      height: 54px;
      margin: 0 auto 16px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: var(--primary, #7756df);
      color: #fff;
      font-size: 28px;
      line-height: 1;
    }

    #${OVERLAY_ID} .tg-orientation-lock-title {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.18;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    #${OVERLAY_ID} .tg-orientation-lock-text {
      margin: 0;
      font-size: 15px;
      line-height: 1.42;
      color: var(--text-secondary, rgba(247, 247, 251, 0.72));
    }
  `;

  document.head.appendChild(style);
};

const ensureOrientationOverlay = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("role", "dialog");
  overlay.innerHTML = `
    <div class="tg-orientation-lock-card">
      <div class="tg-orientation-lock-icon" aria-hidden="true">↻</div>
      <h1 class="tg-orientation-lock-title">Поверните телефон вертикально</h1>
      <p class="tg-orientation-lock-text">Приложение работает только в вертикальном режиме, чтобы сетка и панели не ломались.</p>
    </div>
  `;

  document.body.appendChild(overlay);
};

const lockCurrentPortraitOrientation = () => {
  const tg = getTelegramWebApp();

  if (!canUseTelegramOrientationLock(tg)) return;
  if (isLandscapeViewport()) return;
  if (lockAttemptedInPortrait && tg?.isOrientationLocked === true) return;

  try {
    tg?.lockOrientation?.();
    lockAttemptedInPortrait = true;
  } catch {
    // На старых клиентах Telegram метод может быть недоступен — тогда остаётся CSS-блокер landscape.
  }
};

const syncOrientationState = () => {
  if (typeof document === "undefined") return;

  // Вне мобильного Telegram (веб, десктоп) — никогда не блокируем и снимаем класс,
  // если он был выставлен ранее, пока Telegram-данные ещё подгружались.
  if (!isMobileTelegramClient()) {
    document.documentElement.classList.remove(LANDSCAPE_CLASS);
    document.documentElement.dataset.appOrientation = "portrait";
    return;
  }

  ensureOrientationStyles();
  ensureOrientationOverlay();

  const isLandscape = isLandscapeViewport();
  document.documentElement.classList.toggle(LANDSCAPE_CLASS, isLandscape);
  document.documentElement.dataset.appOrientation = isLandscape ? "landscape" : "portrait";

  if (!isLandscape) {
    lockCurrentPortraitOrientation();
  }
};

const scheduleOrientationSync = () => {
  if (typeof window === "undefined") return;
  if (orientationRafId !== null) return;

  orientationRafId = window.requestAnimationFrame(() => {
    orientationRafId = null;
    syncOrientationState();
  });
};

export const bootstrapTelegramOrientationLock = () => {
  if (isBootstrapped) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  isBootstrapped = true;

  syncOrientationState();

  window.addEventListener("resize", scheduleOrientationSync, { passive: true });
  window.addEventListener("orientationchange", scheduleOrientationSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleOrientationSync, { passive: true });
  document.addEventListener("visibilitychange", scheduleOrientationSync);

  // Telegram иногда обновляет WebApp API не сразу после загрузки telegram-web-app.js.
  window.setTimeout(scheduleOrientationSync, 120);
  window.setTimeout(scheduleOrientationSync, 450);
  window.setTimeout(scheduleOrientationSync, 1000);
};
