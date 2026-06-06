/**
 * Утилита для тактильной обратной связи через Telegram WebApp HapticFeedback.
 * На не-Telegram платформах тихо игнорируется.
 */

type TelegramHaptic = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (type: "error" | "success" | "warning") => void;
  selectionChanged?: () => void;
};

const getHaptic = (): TelegramHaptic | null => {
  if (typeof window === "undefined") return null;
  try {
    return (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: TelegramHaptic } } })
      .Telegram?.WebApp?.HapticFeedback ?? null;
  } catch {
    return null;
  }
};

export const haptic = {
  /** Лёгкий тап — выбор цвета, переключение инструмента, пипетка */
  light: () => {
    try { getHaptic()?.impactOccurred?.("light"); } catch { /* ignore */ }
  },
  /** Средний — начало штриха кисти, применение формы */
  medium: () => {
    try { getHaptic()?.impactOccurred?.("medium"); } catch { /* ignore */ }
  },
  /** Успех — шаринг, создание проекта, экспорт */
  success: () => {
    try { getHaptic()?.notificationOccurred?.("success"); } catch { /* ignore */ }
  },
  /** Ошибка — неудачное действие */
  error: () => {
    try { getHaptic()?.notificationOccurred?.("error"); } catch { /* ignore */ }
  },
  /** Тонкий тик — прокрутка по элементам, смена симметрии */
  selection: () => {
    try { getHaptic()?.selectionChanged?.(); } catch { /* ignore */ }
  },
};
