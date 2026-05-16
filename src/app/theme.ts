/**
 * Сервис темы приложения.
 *
 * Интерфейс читает цвета из CSS-переменных. Этот модуль — единственное место,
 * которое читает/сохраняет тему и обновляет `data-theme` у корневого элемента.
 */

export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "beadly-theme-v1";

const THEME_ANIMATION_MS = 420;

let themeAnimationTimeoutId: number | null = null;

const shouldReduceMotion = () => {
  if (typeof window === "undefined") return true;

  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
};

/** Читает сохранённую тему и по умолчанию использует тёмную тему в стиле Telegram. */
export const getStoredTheme = (): AppTheme => {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
  } catch {
    // localStorage может быть недоступен в приватном режиме или WebView.
  }

  return "dark";
};

/** Сохраняет выбранную тему. Ошибка сохранения не блокирует работу в WebView. */
export const saveTheme = (theme: AppTheme) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Тема уже применена в текущей сессии, сохранение не критично.
  }
};

const updateThemeColorMeta = (theme: AppTheme) => {
  const isLight = theme === "light";
  const themeColorMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", isLight ? "#f7f7fb" : "#0b0e14");
  }
};

/**
 * Применяет выбранную тему к CSS-переменным.
 *
 * При реальном переключении добавляем временный класс, который включает
 * плавные transitions только на время смены темы. На первом запуске класс
 * не добавляем, чтобы приложение не моргало при загрузке.
 */
export const applyAppTheme = (theme: AppTheme) => {
  const root = document.documentElement;
  const previousTheme = root.dataset.theme as AppTheme | undefined;
  const shouldAnimate =
    Boolean(previousTheme) && previousTheme !== theme && !shouldReduceMotion();

  if (themeAnimationTimeoutId !== null) {
    window.clearTimeout(themeAnimationTimeoutId);
    themeAnimationTimeoutId = null;
  }

  if (shouldAnimate) {
    root.classList.add("theme-is-changing");
  } else {
    root.classList.remove("theme-is-changing");
  }

  root.dataset.theme = theme;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  updateThemeColorMeta(theme);

  if (shouldAnimate) {
    themeAnimationTimeoutId = window.setTimeout(() => {
      root.classList.remove("theme-is-changing");
      themeAnimationTimeoutId = null;
    }, THEME_ANIMATION_MS);
  }
};

export const getNextTheme = (theme: AppTheme): AppTheme => {
  return theme === "dark" ? "light" : "dark";
};
