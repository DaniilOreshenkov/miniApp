import { useEffect, useState, type RefObject } from "react";

const MIN_SHEET_HEIGHT = 280;
const TOP_SAFE_GAP = 16;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_DETECTION_GAP = 80;

type KeyboardAwareSheetLayout = {
  bottomOffset: number;
  maxHeight: number;
  isKeyboardOpen: boolean;
};

const getWindowHeight = () => {
  if (typeof window === "undefined") return 0;
  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getViewportData = () => {
  if (typeof window === "undefined") {
    return {
      viewportHeight: 0,
      viewportOffsetTop: 0,
      windowHeight: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const windowHeight = getWindowHeight();

  return {
    viewportHeight: visualViewport?.height ?? windowHeight,
    viewportOffsetTop: visualViewport?.offsetTop ?? 0,
    windowHeight,
  };
};

const getNextLayout = (): KeyboardAwareSheetLayout => {
  const { viewportHeight, viewportOffsetTop, windowHeight } = getViewportData();
  const keyboardOffset = Math.max(0, windowHeight - viewportHeight - viewportOffsetTop);
  const isKeyboardOpen =
    keyboardOffset > KEYBOARD_DETECTION_GAP ||
    viewportHeight < windowHeight - KEYBOARD_DETECTION_GAP;

  const maxHeight = Math.max(
    MIN_SHEET_HEIGHT,
    Math.floor(viewportHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP),
  );

  return {
    bottomOffset: Math.round(keyboardOffset),
    maxHeight,
    isKeyboardOpen,
  };
};

const isSameLayout = (
  first: KeyboardAwareSheetLayout,
  second: KeyboardAwareSheetLayout,
) => {
  return (
    first.bottomOffset === second.bottomOffset &&
    first.maxHeight === second.maxHeight &&
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

    const updateLayout = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        const nextLayout = getNextLayout();
        setLayout((prevLayout) =>
          isSameLayout(prevLayout, nextLayout) ? prevLayout : nextLayout,
        );
      });
    };

    updateLayout();

    window.visualViewport?.addEventListener("resize", updateLayout);
    window.visualViewport?.addEventListener("scroll", updateLayout);
    window.addEventListener("resize", updateLayout);
    window.addEventListener("orientationchange", updateLayout);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      window.visualViewport?.removeEventListener("resize", updateLayout);
      window.visualViewport?.removeEventListener("scroll", updateLayout);
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("orientationchange", updateLayout);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let scrollTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (event: FocusEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!contentElement.contains(target)) return;

      if (scrollTimerId !== null) {
        window.clearTimeout(scrollTimerId);
      }

      scrollTimerId = window.setTimeout(() => {
        const contentRect = contentElement.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const topGap = 18;
        const bottomGap = 24;

        if (targetRect.top < contentRect.top + topGap) {
          contentElement.scrollBy({
            top: targetRect.top - contentRect.top - topGap,
            behavior: "smooth",
          });
          return;
        }

        if (targetRect.bottom > contentRect.bottom - bottomGap) {
          contentElement.scrollBy({
            top: targetRect.bottom - contentRect.bottom + bottomGap,
            behavior: "smooth",
          });
        }
      }, 120);
    };

    contentElement.addEventListener("focusin", scrollFocusedFieldIntoView);

    return () => {
      if (scrollTimerId !== null) {
        window.clearTimeout(scrollTimerId);
      }

      contentElement.removeEventListener("focusin", scrollFocusedFieldIntoView);
    };
  }, [contentRef, open]);

  return layout;
};
