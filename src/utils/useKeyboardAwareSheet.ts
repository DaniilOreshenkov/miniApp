import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 8;
const KEYBOARD_DETECTION_GAP = 90;
const LAYOUT_CHANGE_THRESHOLD = 5;
const FOCUS_SCROLL_DELAY_MS = 60;
const FOCUS_SCROLL_AFTER_KEYBOARD_MS = 230;
const SETTLE_DELAY_MS = 180;

export type KeyboardAwareSheetLayout = {
  /**
   * Смещение sheet вверх до нижней границы visualViewport.
   * Нужно для Telegram/iOS WebView, где fixed-bottom может визуально оказаться под клавиатурой.
   */
  bottomOffset: number;
  /** Доступная высота sheet внутри видимой области Telegram WebView. */
  maxHeight: number;
  /** Признак, что visualViewport уменьшился из-за клавиатуры. */
  isKeyboardOpen: boolean;
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getVisualViewportMetrics = () => {
  if (typeof window === "undefined") {
    return {
      height: 0,
      offsetTop: 0,
      bottomOffset: 0,
    };
  }

  const layoutViewportHeight = getLayoutViewportHeight();
  const visualViewport = window.visualViewport;
  const visualViewportHeight = visualViewport?.height ?? layoutViewportHeight;
  const visualViewportOffsetTop = visualViewport?.offsetTop ?? 0;

  /*
    В Telegram WebView fixed-элементы могут оставаться привязанными к layout viewport,
    а клавиатура уменьшает только visualViewport. Поэтому считаем реальную нижнюю
    границу видимой области и поднимаем sheet ровно до неё.
  */
  const visualViewportBottom = visualViewportOffsetTop + visualViewportHeight;
  const bottomOffset = Math.max(
    0,
    Math.ceil(layoutViewportHeight - visualViewportBottom),
  );

  return {
    height: visualViewportHeight || layoutViewportHeight,
    offsetTop: visualViewportOffsetTop,
    bottomOffset,
  };
};

const getNextLayout = (): KeyboardAwareSheetLayout => {
  const layoutViewportHeight = getLayoutViewportHeight();
  const viewportMetrics = getVisualViewportMetrics();
  const visualViewportHeight = viewportMetrics.height || layoutViewportHeight;
  const keyboardInset = viewportMetrics.bottomOffset;
  const isKeyboardOpen = keyboardInset > KEYBOARD_DETECTION_GAP;

  /*
    maxHeight всегда считаем только по видимой области. Это не даёт sheet уйти
    за экран/клавиатуру: если места мало, контент не растягивает окно, а скроллится внутри.
  */
  const availableSheetHeight = Math.floor(
    visualViewportHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP,
  );

  return {
    bottomOffset: keyboardInset,
    maxHeight: Math.max(1, availableSheetHeight),
    isKeyboardOpen,
  };
};

const isSameLayout = (
  first: KeyboardAwareSheetLayout,
  second: KeyboardAwareSheetLayout,
) => {
  return (
    Math.abs(first.maxHeight - second.maxHeight) < LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.bottomOffset - second.bottomOffset) < LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen
  );
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => getNextLayout());
  const latestLayoutRef = useRef(layout);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (!open) {
      const nextLayout = getNextLayout();
      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      return;
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;

    const applyLayout = () => {
      rafId = null;
      const nextLayout = getNextLayout();

      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const scheduleLayoutUpdate = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyLayout);
      }

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      if (finalSettleTimerId !== null) {
        window.clearTimeout(finalSettleTimerId);
      }

      /*
        Клавиатура в Telegram открывается не одним кадром. Первый пересчёт даёт
        быстрый отклик, два финальных — точную высоту после системной анимации.
      */
      settleTimerId = window.setTimeout(applyLayout, SETTLE_DELAY_MS);
      finalSettleTimerId = window.setTimeout(applyLayout, SETTLE_DELAY_MS + 180);
    };

    scheduleLayoutUpdate();

    window.visualViewport?.addEventListener("resize", scheduleLayoutUpdate);
    window.addEventListener("resize", scheduleLayoutUpdate);
    window.addEventListener("orientationchange", scheduleLayoutUpdate);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      if (finalSettleTimerId !== null) {
        window.clearTimeout(finalSettleTimerId);
      }

      window.visualViewport?.removeEventListener("resize", scheduleLayoutUpdate);
      window.removeEventListener("resize", scheduleLayoutUpdate);
      window.removeEventListener("orientationchange", scheduleLayoutUpdate);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimerId: number | null = null;
    let keyboardTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = 36;

      if (targetRect.top < contentRect.top + topGap) {
        contentElement.scrollTop += targetRect.top - contentRect.top - topGap;
        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        contentElement.scrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!contentElement.contains(target)) return;

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (keyboardTimerId !== null) {
        window.clearTimeout(keyboardTimerId);
      }

      focusTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_DELAY_MS);

      keyboardTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_AFTER_KEYBOARD_MS);
    };

    contentElement.addEventListener("focusin", handleFocusIn);

    return () => {
      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (keyboardTimerId !== null) {
        window.clearTimeout(keyboardTimerId);
      }

      contentElement.removeEventListener("focusin", handleFocusIn);
    };
  }, [contentRef, open]);

  return layout;
};
