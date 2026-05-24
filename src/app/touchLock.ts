/**
 * Глобальная touch-защита для Telegram WebView.
 *
 * Telegram на мобильных клиентах закрывает/сворачивает Mini App вертикальным
 * свайпом от верхнего края. Этот модуль не заменяет Telegram API, а работает
 * как дополнительная защита от overscroll и случайного протягивания страницы.
 */

const EDGE_TOLERANCE_PX = 2;
const GESTURE_THRESHOLD_PX = 4;

type TouchState = {
  startX: number;
  startY: number;
  scrollElement: HTMLElement | null;
};

const touchState: TouchState = {
  startX: 0,
  startY: 0,
  scrollElement: null,
};

const canScrollVertically = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;

  return (
    (overflowY === "auto" || overflowY === "scroll") &&
    element.scrollHeight > element.clientHeight + EDGE_TOLERANCE_PX
  );
};

const findScrollableElement = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof HTMLElement)) return null;

  let current: HTMLElement | null = target;

  while (current && current !== document.body) {
    if (canScrollVertically(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return target.closest(".app-scroll") as HTMLElement | null;
};

const isAtTop = (element: HTMLElement) => {
  return element.scrollTop <= EDGE_TOLERANCE_PX;
};

const isAtBottom = (element: HTMLElement) => {
  return (
    element.scrollTop + element.clientHeight >=
    element.scrollHeight - EDGE_TOLERANCE_PX
  );
};

const shouldAllowHorizontalToolbarGesture = (target: EventTarget | null, dx: number, dy: number) => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest(".bottom-toolbar-scroll")) && dx > dy;
};

const onTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch) return;

  touchState.startX = touch.clientX;
  touchState.startY = touch.clientY;
  touchState.scrollElement = findScrollableElement(event.target);
};

const onTouchMove = (event: TouchEvent) => {
  if (event.touches.length !== 1) return;

  const touch = event.touches[0];
  if (!touch) return;

  const deltaX = touch.clientX - touchState.startX;
  const deltaY = touch.clientY - touchState.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < GESTURE_THRESHOLD_PX && absY < GESTURE_THRESHOLD_PX) {
    return;
  }

  if (shouldAllowHorizontalToolbarGesture(event.target, absX, absY)) {
    return;
  }

  const fixedEditorArea =
    event.target instanceof HTMLElement
      ? event.target.closest(".app-fixed")
      : null;

  // В редакторе все жесты обрабатывает canvas/инструменты, поэтому нативный
  // overscroll Telegram всегда гасим на уровне документа.
  if (fixedEditorArea) {
    event.preventDefault();
    return;
  }

  const scrollElement = touchState.scrollElement;

  if (!scrollElement) {
    event.preventDefault();
    return;
  }

  const isVerticalGesture = absY >= absX;

  if (!isVerticalGesture) {
    return;
  }

  const pullsDownFromTop = deltaY > 0 && isAtTop(scrollElement);
  const pullsUpFromBottom = deltaY < 0 && isAtBottom(scrollElement);

  // Главное место защиты: не даём WebView получить pull-to-close,
  // когда пользователь тянет страницу за верхнюю/нижнюю границу.
  if (pullsDownFromTop || pullsUpFromBottom) {
    event.preventDefault();
  }
};

const onTouchEnd = () => {
  touchState.scrollElement = null;
};

/** Устанавливает мобильные touch-защиты и возвращает функцию очистки. */
export const initAppTouchLock = () => {
  document.documentElement.classList.add("tg-swipe-lock");

  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });

  document.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });

  document.addEventListener("touchend", onTouchEnd, {
    passive: true,
    capture: true,
  });

  document.addEventListener("touchcancel", onTouchEnd, {
    passive: true,
    capture: true,
  });

  return () => {
    document.documentElement.classList.remove("tg-swipe-lock");
    document.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("touchmove", onTouchMove, true);
    document.removeEventListener("touchend", onTouchEnd, true);
    document.removeEventListener("touchcancel", onTouchEnd, true);
  };
};
