/**
 * Сервис темы приложения.
 *
 * Цвета интерфейса живут в CSS-переменных `index.css`.
 * Здесь оставляем только чтение, сохранение и применение темы к `data-theme`.
 *
 * Важно: плавность переключения теперь делает не массовый transition всех элементов,
 * а лёгкий crossfade-слой в `App.tsx`. Так интерфейс не лагает на телефоне.
 */

export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "beadly-theme-v1";

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
 * Применяет тему мгновенно.
 *
 * Мы специально не включаем transition на всех элементах через JS: на мобильном
 * WebView это создаёт микролаги. Визуальную плавность даёт один overlay-слой.
 */
export const applyAppTheme = (theme: AppTheme) => {
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  updateThemeColorMeta(theme);
};

export const getNextTheme = (theme: AppTheme): AppTheme => {
  return theme === "dark" ? "light" : "dark";
};

export const getThemeBackgroundColor = (theme: AppTheme) => {
  return theme === "light" ? "#f7f7fb" : "#0b0e14";
};
