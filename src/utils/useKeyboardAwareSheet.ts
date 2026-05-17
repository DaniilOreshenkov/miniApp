import { useEffect, useState, type RefObject } from "react";

const MIN_SHEET_HEIGHT = 280;
const TOP_SAFE_GAP = 16;
const BOTTOM_SAFE_GAP = 14;
const KEYBOARD_DETECTION_GAP = 80;
const LAYOUT_CHANGE_THRESHOLD = 8;

type KeyboardAwareSheetLayout = {
  /**
   * Sheet не поднимаем над клавиатурой через bottom — это даёт рывки в Telegram WebView.
   * Вместо этого уменьшаем maxHeight, а контент внутри sheet начинает скроллиться.
   */
  bottomOffset: number;
  maxHeight: number;
  isKeyboardOpen: boolean;
};

const getWindowHeight = () => {
  if (typeof window === "undefined") return 0;
  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getVisualViewportHeight = () => {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? getWindowHeight();
};

const getNextLayout = (): KeyboardAwareSheetLayout => {
  const windowHeight = getWindowHeight();
  const visualViewportHeight = getVisualViewportHeight();
  const safeViewportHeight = Math.max(0, Math.min(windowHeight, visualViewportHeight));
  const keyboardHeight = Math.max(0, windowHeight - safeViewportHeight);
  const isKeyboardOpen = keyboardHeight > KEYBOARD_DETECTION_GAP;

  return {
    bottomOffset: 0,
    maxHeight: Math.max(
      MIN_SHEET_HEIGHT,
      Math.floor(safeViewportHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP),
    ),
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

  useEffect(() => {
    if (!open) {
      setLayout(getNextLayout());
      return;
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;

    const applyLayout = () => {
      const nextLayout = getNextLayout();
      setLayout((prevLayout) =>
        isSameLayout(prevLayout, nextLayout) ? prevLayout : nextLayout,
      );
    };

    const scheduleLayoutUpdate = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(applyLayout);

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      // На iOS/Telegram клавиатура меняет viewport в несколько шагов.
      // Финальный пересчёт после анимации убирает мелкие расхождения по высоте.
      settleTimerId = window.setTimeout(applyLayout, 180);
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
        const bottomGap = 22;

        if (targetRect.top < contentRect.top + topGap) {
          contentElement.scrollTop += targetRect.top - contentRect.top - topGap;
          return;
        }

        if (targetRect.bottom > contentRect.bottom - bottomGap) {
          contentElement.scrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
        }
      }, 90);
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
