import { useEffect, useRef, useState, type RefObject } from "react";

const MIN_SHEET_HEIGHT = 280;
const TOP_SAFE_GAP = 14;
const BOTTOM_SAFE_GAP = 12;
const KEYBOARD_DETECTION_GAP = 80;
const LAYOUT_CHANGE_THRESHOLD = 8;
const FOCUS_SCROLL_DELAY_MS = 80;
const SETTLE_DELAY_MS = 170;

type KeyboardAwareSheetLayout = {
  /**
   * Sheet не поднимаем над клавиатурой через bottom: в Telegram WebView это
   * часто вызывает рывки. Окно остаётся закреплённым снизу, а доступная
   * высота уменьшается через maxHeight. Если контент не помещается —
   * скролл появляется внутри sheet.
   */
  bottomOffset: number;
  maxHeight: number;
  isKeyboardOpen: boolean;
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getVisualViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return window.visualViewport?.height ?? getLayoutViewportHeight();
};

const getNextLayout = (): KeyboardAwareSheetLayout => {
  const layoutViewportHeight = getLayoutViewportHeight();
  const visualViewportHeight = getVisualViewportHeight();

  /*
    Берём меньшую высоту из layout viewport и visual viewport.
    Так sheet не залезает под системную навигацию Telegram и клавиатуру,
    но при этом не прыгает вверх из-за visualViewport.offsetTop.
  */
  const availableViewportHeight = Math.max(
    0,
    Math.min(layoutViewportHeight, visualViewportHeight || layoutViewportHeight),
  );
  const keyboardHeight = Math.max(0, layoutViewportHeight - availableViewportHeight);
  const isKeyboardOpen = keyboardHeight > KEYBOARD_DETECTION_GAP;
  const nextMaxHeight = Math.floor(
    availableViewportHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP,
  );

  return {
    bottomOffset: 0,
    maxHeight: Math.max(MIN_SHEET_HEIGHT, nextMaxHeight),
    isKeyboardOpen,
  };
};

const isSameLayout = (
  first: KeyboardAwareSheetLayout,
  second: KeyboardAwareSheetLayout,
) => {
  return (
    Math.abs(first.maxHeight - second.maxHeight) < LAYOUT_CHANGE_THRESHOLD &&
    first.bottomOffset === second.bottomOffset &&
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

    const applyLayout = () => {
      rafId = null;
      const nextLayout = getNextLayout();

      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const scheduleLayoutUpdate = () => {
      if (rafId !== null) return;

      rafId = window.requestAnimationFrame(applyLayout);

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      /*
        iOS и Telegram WebView меняют visualViewport в несколько этапов.
        Один финальный пересчёт после анимации клавиатуры убирает расхождения
        без постоянного дёргания UI.
      */
      settleTimerId = window.setTimeout(applyLayout, SETTLE_DELAY_MS);
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

    const scrollFocusedFieldIntoView = (event: FocusEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!contentElement.contains(target)) return;

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      focusTimerId = window.setTimeout(() => {
        const contentRect = contentElement.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const topGap = 18;
        const bottomGap = 24;

        if (targetRect.top < contentRect.top + topGap) {
          contentElement.scrollTop += targetRect.top - contentRect.top - topGap;
          return;
        }

        if (targetRect.bottom > contentRect.bottom - bottomGap) {
          contentElement.scrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
        }
      }, FOCUS_SCROLL_DELAY_MS);
    };

    contentElement.addEventListener("focusin", scrollFocusedFieldIntoView);

    return () => {
      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      contentElement.removeEventListener("focusin", scrollFocusedFieldIntoView);
    };
  }, [contentRef, open]);

  return layout;
};
