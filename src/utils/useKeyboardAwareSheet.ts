import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 10;
const MIN_SHEET_HEIGHT = 180;
const BACKDROP_CLOSE_IGNORE_MS = 450;
const KEYBOARD_DETECTION_GAP = 72;
const LAYOUT_CHANGE_THRESHOLD = 3;
const SETTLE_DELAY_MS = 120;
const FINAL_SETTLE_DELAY_MS = 340;
const CLOSED_LAYOUT_RESET_DELAY_MS = 360;
const FOCUS_SCROLL_DELAY_MS = 80;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 320;

export type KeyboardAwareSheetLayout = {
  /** Offset that moves sheet above native keyboard. */
  bottomOffset: number;
  /** Max height inside currently visible viewport. */
  maxHeight: number;
  isKeyboardOpen: boolean;
  /** While true, CSS transition should be disabled and sheet follows visualViewport directly. */
  isViewportChanging: boolean;
};

type VisualViewportMetrics = {
  stableHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

let ignoreSheetBackdropCloseUntil = 0;

export const markSheetInputInteraction = () => {
  ignoreSheetBackdropCloseUntil = Date.now() + BACKDROP_CLOSE_IGNORE_MS;
};

export const shouldIgnoreSheetBackdropClose = () => Date.now() < ignoreSheetBackdropCloseUntil;

const normalizePx = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
};

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return fallback;

  const numericValue = Number(rawValue.replace("px", ""));
  if (!Number.isFinite(numericValue)) return fallback;

  return Math.max(0, Math.round(numericValue));
};

const getStableViewportHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(
      readRootCssPx("--app-stable-height"),
      readRootCssPx("--app-height"),
      window.innerHeight ?? 0,
      document.documentElement.clientHeight ?? 0,
      window.visualViewport?.height ?? 0,
    ),
  );
};

const getMetrics = (): VisualViewportMetrics => {
  const stableHeight = Math.max(getStableViewportHeight(), 1);

  if (typeof window === "undefined") {
    return {
      stableHeight,
      visualHeight: stableHeight,
      visualOffsetTop: 0,
      keyboardInset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = normalizePx(visualViewport?.height ?? stableHeight);
  const visualOffsetTop = normalizePx(visualViewport?.offsetTop ?? 0);
  const visualBottom = visualOffsetTop + visualHeight;
  const cssKeyboardInset = Math.max(
    readRootCssPx("--sheet-keyboard-offset"),
    readRootCssPx("--app-keyboard-offset"),
    readRootCssPx("--tg-keyboard-offset"),
  );

  return {
    stableHeight,
    visualHeight: Math.max(visualHeight, 1),
    visualOffsetTop,
    keyboardInset: normalizePx(Math.max(cssKeyboardInset, stableHeight - visualBottom, stableHeight - visualHeight, 0)),
  };
};

const getNextLayout = (isViewportChanging = false): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const isKeyboardOpen = metrics.keyboardInset > KEYBOARD_DETECTION_GAP;
  const topLimit = Math.max(TOP_SAFE_GAP, readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP));
  const bottomLimit = Math.max(BOTTOM_SAFE_GAP, readRootCssPx("--sheet-bottom-gap", BOTTOM_SAFE_GAP));
  const visibleHeight = isKeyboardOpen
    ? Math.max(metrics.visualHeight, metrics.stableHeight - metrics.keyboardInset)
    : metrics.stableHeight;

  const maxHeight = Math.max(
    MIN_SHEET_HEIGHT,
    Math.floor(visibleHeight - metrics.visualOffsetTop - topLimit - bottomLimit),
  );

  return {
    bottomOffset: isKeyboardOpen ? metrics.keyboardInset : 0,
    maxHeight,
    isKeyboardOpen,
    isViewportChanging,
  };
};

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
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

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => getNextLayout(false));
  const latestLayoutRef = useRef(layout);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!open) {
      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getNextLayout(false);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
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

    window.visualViewport?.addEventListener("resize", scheduleChangingLayout, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleChangingLayout, { passive: true });
    window.addEventListener("resize", scheduleChangingLayout, { passive: true });
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
    if (!open || typeof window === "undefined") return undefined;

    const contentElement = contentRef.current;
    if (!contentElement) return undefined;

    let focusTimerId: number | null = null;
    let settleFocusTimerId: number | null = null;

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

      pendingFocusTargetRef.current = target;
      markSheetInputInteraction();

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

      pendingFocusTargetRef.current = null;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [contentRef, open]);

  return layout;
};
