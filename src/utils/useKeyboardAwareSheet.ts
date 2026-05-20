import { useEffect, useRef, useState, type RefObject } from "react";

const MIN_SHEET_HEIGHT = 180;
const DEFAULT_TOP_GAP = 12;
const DEFAULT_BOTTOM_GAP = 10;
const KEYBOARD_DETECTION_GAP = 90;
const LAYOUT_CHANGE_THRESHOLD = 3;
const SETTLE_DELAY_MS = 130;
const FINAL_SETTLE_DELAY_MS = 340;
const CLOSED_LAYOUT_RESET_DELAY_MS = 360;
const FOCUS_SCROLL_DELAY_MS = 80;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 320;
const BACKDROP_IGNORE_MS = 450;

let ignoreBackdropCloseUntil = 0;

export const shouldIgnoreSheetBackdropClose = () => {
  return Date.now() < ignoreBackdropCloseUntil;
};

const markSheetInputInteraction = () => {
  ignoreBackdropCloseUntil = Date.now() + BACKDROP_IGNORE_MS;
};

export type KeyboardAwareSheetLayout = {
  bottomOffset: number;
  maxHeight: number;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
};

type VisualViewportMetrics = {
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const readCssPxVar = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return 0;

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue)) return 0;

  return normalizePx(parsedValue);
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined") return 0;
  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getMetrics = (): VisualViewportMetrics => {
  const layoutHeight = getLayoutViewportHeight();

  if (typeof window === "undefined") {
    return {
      layoutHeight,
      visualHeight: layoutHeight,
      visualOffsetTop: 0,
      keyboardInset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? layoutHeight;
  const visualOffsetTop = visualViewport?.offsetTop ?? 0;
  const visualBottom = visualOffsetTop + visualHeight;

  return {
    layoutHeight,
    visualHeight: visualHeight || layoutHeight,
    visualOffsetTop,
    keyboardInset: normalizePx(layoutHeight - visualBottom),
  };
};

const getSheetTopLimit = () => {
  const appTopLimit = readCssPxVar("--app-tg-sheet-top-limit");
  if (appTopLimit > 0) return appTopLimit;

  const safeTop = readCssPxVar("--tg-safe-area-inset-top");
  const contentTop = readCssPxVar("--tg-content-safe-area-inset-top");
  const telegramTop = safeTop + contentTop;

  return telegramTop > 0 ? telegramTop + 8 : DEFAULT_TOP_GAP;
};

const getSheetBottomGap = () => {
  return Math.max(
    readCssPxVar("--sheet-bottom-gap"),
    readCssPxVar("--app-tg-safe-bottom"),
    DEFAULT_BOTTOM_GAP,
  );
};

const getNextLayout = (isViewportChanging = false): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const isKeyboardOpen = metrics.keyboardInset > KEYBOARD_DETECTION_GAP;
  const topLimit = getSheetTopLimit();
  const bottomGap = getSheetBottomGap();

  const maxHeight = Math.max(
    MIN_SHEET_HEIGHT,
    Math.floor(metrics.visualHeight - metrics.visualOffsetTop - topLimit - bottomGap),
  );

  return {
    bottomOffset: isKeyboardOpen ? metrics.keyboardInset : 0,
    maxHeight,
    isKeyboardOpen,
    isViewportChanging,
  };
};

const isSameLayout = (
  first: KeyboardAwareSheetLayout,
  second: KeyboardAwareSheetLayout,
) => {
  return (
    Math.abs(first.bottomOffset - second.bottomOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging
  );
};

const shouldHandleFocusedElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
};

const clampScrollTop = (element: HTMLElement, nextScrollTop: number) => {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, Math.round(nextScrollTop)));
};

const applySheetCssVariables = (layout: KeyboardAwareSheetLayout, open: boolean) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const keyboardOffset = open ? layout.bottomOffset : 0;

  root.style.setProperty("--sheet-keyboard-offset", `${keyboardOffset}px`);
  root.style.setProperty("--sheet-keyboard-offset-negative", `${-keyboardOffset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
  root.style.setProperty(
    "--sheet-root-transform-duration",
    layout.isViewportChanging ? "0ms" : "260ms",
  );
  root.style.setProperty(
    "--sheet-container-maxheight-duration",
    layout.isViewportChanging ? "0ms" : "260ms",
  );
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => getNextLayout(false));
  const latestLayoutRef = useRef(layout);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
    applySheetCssVariables(layout, open);
  }, [layout, open]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    if (open) {
      root.classList.add("sheet-open");
      applySheetCssVariables(latestLayoutRef.current, true);
    } else {
      root.classList.remove("sheet-open", "sheet-input-focus-lock");
      applySheetCssVariables(latestLayoutRef.current, false);
    }

    return () => {
      root.classList.remove("sheet-open", "sheet-input-focus-lock");
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getNextLayout(false);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
        applySheetCssVariables(nextLayout, false);
      }, CLOSED_LAYOUT_RESET_DELAY_MS);

      return () => {
        window.clearTimeout(resetTimerId);
      };
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;

    const setNextLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      applySheetCssVariables(nextLayout, true);
    };

    const applyChangingLayout = () => {
      rafId = null;
      setNextLayout(getNextLayout(true));
    };

    const scheduleChangingLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyChangingLayout);
      }

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      if (finalSettleTimerId !== null) {
        window.clearTimeout(finalSettleTimerId);
      }

      settleTimerId = window.setTimeout(() => {
        setNextLayout(getNextLayout(false));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        setNextLayout(getNextLayout(false));
      }, FINAL_SETTLE_DELAY_MS);
    };

    scheduleChangingLayout();

    window.visualViewport?.addEventListener("resize", scheduleChangingLayout);
    window.visualViewport?.addEventListener("scroll", scheduleChangingLayout);
    window.addEventListener("resize", scheduleChangingLayout);
    window.addEventListener("orientationchange", scheduleChangingLayout);

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

      window.visualViewport?.removeEventListener("resize", scheduleChangingLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleChangingLayout);
      window.removeEventListener("resize", scheduleChangingLayout);
      window.removeEventListener("orientationchange", scheduleChangingLayout);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimerId: number | null = null;
    let settleFocusTimerId: number | null = null;
    let focusOutTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 16;
      const bottomGap = 56;

      if (targetRect.top < contentRect.top + topGap) {
        const nextScrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.top - contentRect.top - topGap,
        );

        if (Math.abs(nextScrollTop - contentElement.scrollTop) > 1) {
          contentElement.scrollTop = nextScrollTop;
        }

        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        const nextScrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.bottom - contentRect.bottom + bottomGap,
        );

        if (Math.abs(nextScrollTop - contentElement.scrollTop) > 1) {
          contentElement.scrollTop = nextScrollTop;
        }
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldHandleFocusedElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      markSheetInputInteraction();
      document.documentElement.classList.add("sheet-input-focus-lock");
      pendingFocusTargetRef.current = target;

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
        focusOutTimerId = null;
      }

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
      }

      focusTimerId = window.setTimeout(() => {
        if (pendingFocusTargetRef.current) {
          scrollFocusedFieldIntoView(pendingFocusTargetRef.current);
        }
      }, FOCUS_SCROLL_DELAY_MS);

      settleFocusTimerId = window.setTimeout(() => {
        if (pendingFocusTargetRef.current) {
          scrollFocusedFieldIntoView(pendingFocusTargetRef.current);
        }
      }, FOCUS_SCROLL_AFTER_SETTLE_MS);
    };

    const handleFocusOut = () => {
      pendingFocusTargetRef.current = null;

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
      }

      focusOutTimerId = window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && contentElement.contains(activeElement)) {
          return;
        }

        document.documentElement.classList.remove("sheet-input-focus-lock");
      }, 90);
    };

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);

    return () => {
      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
      }

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
      }

      pendingFocusTargetRef.current = null;
      document.documentElement.classList.remove("sheet-input-focus-lock");
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [contentRef, open]);

  return layout;
};
