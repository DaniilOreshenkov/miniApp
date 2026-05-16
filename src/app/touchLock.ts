/**
 * Глобальная защита от лишних touch-жестов.
 *
 * Блокирует случайные протягивания страницы в Telegram WebView, но сохраняет
 * нормальный вертикальный скролл в `.app-scroll` и жесты фиксированного редактора.
 */

/** Устанавливает мобильные touch-защиты и возвращает функцию очистки. */
export const initAppTouchLock = () => {
  let startX = 0;
  let startY = 0;

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;

    startX = touch.clientX;
    startY = touch.clientY;
  };

  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;

    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);

    const target = event.target as HTMLElement;
    const isScroll = target.closest(".app-scroll");
    const isFixed = target.closest(".app-fixed");

    if (isScroll && dy > dx) {
      return;
    }

    if (isFixed) {
      event.preventDefault();
      return;
    }

    if (dx > dy) {
      event.preventDefault();
    }
  };

  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });

  document.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });

  return () => {
    document.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("touchmove", onTouchMove, true);
  };
};
