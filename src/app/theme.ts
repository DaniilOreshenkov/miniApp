export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "beadly-theme-v1";

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

export const saveTheme = (theme: AppTheme) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Тема уже применена в текущей сессии, сохранение не критично.
  }
};

export const applyAppTheme = (theme: AppTheme) => {
  const root = document.documentElement;
  const isLight = theme === "light";

  root.dataset.theme = theme;
  root.style.colorScheme = isLight ? "light" : "dark";

  const themeColorMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", isLight ? "#f7f7fb" : "#0b0e14");
  }
};

export const getNextTheme = (theme: AppTheme): AppTheme => {
  return theme === "dark" ? "light" : "dark";
};
