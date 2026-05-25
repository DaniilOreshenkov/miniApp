import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const BACKDROP_CLOSE_IGNORE_MS = 420;
const KEYBOARD_OPEN_THRESHOLD = 72;
const KEYBOARD_CLOSE_THRESHOLD = 28;
const LAYOUT_CHANGE_THRESHOLD = 2;
const FOCUS_HANDOFF_MS = 260;
const HOLD_CLOSED_OFFSET_MS = 220;
const SETTLE_DELAY_MS = 190;
const SECOND_SETTLE_DELAY_MS = 360;
const FOCUS_SCROLL_DELAY_MS = 210;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 430;

export type KeyboardAwareSheetLayout = {
  /** Смещение нижней границы sheet над клавиатурой. */
  bottomOffset: number;
  /** Максимальная высота панели между content safe-area top и клавиатурой. */
  maxHeight: number;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
};

let ignoreSheetBackdropCloseUntil = 0;

export const markSheetInputInteraction = () => {
  ignoreSheetBackdropCloseUntil = Date.now() + BACKDROP_CLOSE_IGNORE_MS;
};

export const shouldIgnoreSheetBackdropClose = () => Date.now() < ignoreSheetBackdropCloseUntil;

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return fallback;

  const numericValue = Number(rawValue.replace("px", ""));
  if (!Number.isFinite(numericValue)) return fallback;

  return Math.max(0, Math.round(numericValue));
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(
      readRootCssPx("--tg-viewport-stable-height", 0),
      readRootCssPx("--app-height", 0),
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      window.visualViewport?.height || 0,
    ),
  );
};

const getVisualKeyboardInset = (stableHeight: number) => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    return Math.max(
      0,
      readRootCssPx("--tg-keyboard-offset", 0),
      readRootCssPx("--app-keyboard-offset", 0),
    );
  }

  const visualBottom = visualViewport.offsetTop + visualViewport.height;

  return normalizePx(Math.max(0, stableHeight - visualBottom));
};

const shouldHandleFocusedElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
};

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));

  if (layout) {
    root.style.setProperty("--sheet-keyboard-offset", `${normalizePx(layout.bottomOffset)}px`);
    root.style.setProperty("--sheet-max-height", `${normalizePx(layout.maxHeight)}px`);
  }
};

const clampScrollTop = (element: HTMLElement, nextScrollTop: number) => {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);

  return Math.min(maxScrollTop, Math.max(0, Math.round(nextScrollTop)));
};

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
  return (
    Math.abs(first.bottomOffset - second.bottomOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging
  );
};

const getInitialLayout = (): KeyboardAwareSheetLayout => {
  const stableHeight = Math.max(1, getLayoutViewportHeight());
  const topLimit = Math.max(TOP_SAFE_GAP, readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP));
  const bottomGap = Math.max(BOTTOM_SAFE_GAP, readRootCssPx("--sheet-bottom-gap", BOTTOM_SAFE_GAP));

  return {
    bottomOffset: 0,
    maxHeight: Math.max(180, stableHeight - topLimit - bottomGap),
    isKeyboardOpen: false,
    isViewportChanging: false,
  };
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(getInitialLayout);
  const latestLayoutRef = useRef(layout);
  const stableHeightRef = useRef(0);
  const lastKeyboardOffsetRef = useRef(0);
  const rawZeroSinceRef = useRef<number | null>(null);
  const focusInsideRef = useRef(false);
  const focusHandoffUntilRef = useRef(0);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);

  const computeLayout = (isViewportChanging: boolean): KeyboardAwareSheetLayout => {
    const measuredStableHeight = getLayoutViewportHeight();

    if (stableHeightRef.current <= 0) {
      stableHeightRef.current = Math.max(1, measuredStableHeight);
    }

    const previousKeyboardOpen = lastKeyboardOffsetRef.current > KEYBOARD_OPEN_THRESHOLD;
    const stableHeight = Math.max(stableHeightRef.current, measuredStableHeight, 1);
    const rawKeyboardInset = getVisualKeyboardInset(stableHeight);
    const rawKeyboardLooksOpen = rawKeyboardInset > (previousKeyboardOpen ? KEYBOARD_CLOSE_THRESHOLD : KEYBOARD_OPEN_THRESHOLD);
    const now = Date.now();

    if (!rawKeyboardLooksOpen) {
      if (rawZeroSinceRef.current === null) {
        rawZeroSinceRef.current = now;
      }
    } else {
      rawZeroSinceRef.current = null;
      stableHeightRef.current = stableHeight;
    }

    const contentElement = contentRef.current;
    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const activeElementIsInsideSheet =
      activeElement instanceof HTMLElement && Boolean(contentElement?.contains(activeElement));
    const isFocusHandoffActive = now < focusHandoffUntilRef.current;
    const shouldHoldKeyboardForFocus = focusInsideRef.current || activeElementIsInsideSheet || isFocusHandoffActive;
    const rawClosedForMs = rawZeroSinceRef.current === null ? 0 : now - rawZeroSinceRef.current;
    const canHoldClosedKeyboardOffset =
      shouldHoldKeyboardForFocus &&
      lastKeyboardOffsetRef.current > KEYBOARD_OPEN_THRESHOLD &&
      rawClosedForMs <= HOLD_CLOSED_OFFSET_MS;

    let bottomOffset = 0;

    if (rawKeyboardLooksOpen) {
      bottomOffset = rawKeyboardInset;
    } else if (canHoldClosedKeyboardOffset) {
      bottomOffset = lastKeyboardOffsetRef.current;
    }

    bottomOffset = normalizePx(bottomOffset);

    if (bottomOffset > KEYBOARD_OPEN_THRESHOLD) {
      lastKeyboardOffsetRef.current = bottomOffset;
    } else if (!shouldHoldKeyboardForFocus || rawClosedForMs > HOLD_CLOSED_OFFSET_MS) {
      lastKeyboardOffsetRef.current = 0;
    }

    /*
      Когда клавиатуры нет, можно поднять стабильную высоту, но нельзя уменьшать её
      на resize-событиях клавиатуры. Иначе весь app начинает прыгать.
    */
    if (bottomOffset <= KEYBOARD_OPEN_THRESHOLD && measuredStableHeight > stableHeightRef.current) {
      stableHeightRef.current = measuredStableHeight;
    }

    const topLimit = Math.max(TOP_SAFE_GAP, readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP));
    const bottomGap = Math.max(BOTTOM_SAFE_GAP, readRootCssPx("--sheet-bottom-gap", BOTTOM_SAFE_GAP));
    const maxHeight = Math.max(180, Math.floor(stableHeight - topLimit - bottomGap - bottomOffset));

    return {
      bottomOffset,
      maxHeight,
      isKeyboardOpen: bottomOffset > KEYBOARD_OPEN_THRESHOLD,
      isViewportChanging,
    };
  };

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      focusInsideRef.current = false;
      focusHandoffUntilRef.current = 0;
      pendingFocusTargetRef.current = null;
      rawZeroSinceRef.current = null;
      lastKeyboardOffsetRef.current = 0;
      setRootSheetState(false, latestLayoutRef.current);

      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getInitialLayout();
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
      }, 180);

      return () => window.clearTimeout(resetTimerId);
    }

    setRootSheetState(true, latestLayoutRef.current);
    resetDocumentScroll();

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let secondSettleTimerId: number | null = null;
    let scrollLockRafId: number | null = null;

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);
      setLayout(nextLayout);
    };

    const flushChangingLayout = () => {
      rafId = null;
      commitLayout(computeLayout(true));
    };

    const scheduleLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(flushChangingLayout);
      }

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      if (secondSettleTimerId !== null) {
        window.clearTimeout(secondSettleTimerId);
      }

      settleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, SETTLE_DELAY_MS);

      secondSettleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, SECOND_SETTLE_DELAY_MS);
    };

    const lockGlobalScroll = () => {
      if (scrollLockRafId !== null) return;

      scrollLockRafId = window.requestAnimationFrame(() => {
        scrollLockRafId = null;
        resetDocumentScroll();
      });
    };

    scheduleLayout();

    window.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("scroll", lockGlobalScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (secondSettleTimerId !== null) window.clearTimeout(secondSettleTimerId);
      if (scrollLockRafId !== null) window.cancelAnimationFrame(scrollLockRafId);

      window.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("scroll", lockGlobalScroll);
      window.visualViewport?.removeEventListener("resize", scheduleLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("orientationchange", scheduleLayout);
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

    const scheduleFocusScroll = (target: HTMLElement) => {
      if (focusTimerId !== null) window.clearTimeout(focusTimerId);
      if (settleFocusTimerId !== null) window.clearTimeout(settleFocusTimerId);

      focusTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_DELAY_MS);

      settleFocusTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_AFTER_SETTLE_MS);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldHandleFocusedElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
        focusOutTimerId = null;
      }

      focusInsideRef.current = true;
      focusHandoffUntilRef.current = Date.now() + FOCUS_HANDOFF_MS;
      pendingFocusTargetRef.current = target;
      markSheetInputInteraction();
      resetDocumentScroll();
      scheduleFocusScroll(target);
    };

    const handleFocusOut = () => {
      focusHandoffUntilRef.current = Date.now() + FOCUS_HANDOFF_MS;
      pendingFocusTargetRef.current = null;

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
      }

      focusOutTimerId = window.setTimeout(() => {
        const activeElement = document.activeElement;
        focusInsideRef.current =
          activeElement instanceof HTMLElement && contentElement.contains(activeElement);
      }, 80);
    };

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);

    return () => {
      if (focusTimerId !== null) window.clearTimeout(focusTimerId);
      if (settleFocusTimerId !== null) window.clearTimeout(settleFocusTimerId);
      if (focusOutTimerId !== null) window.clearTimeout(focusOutTimerId);

      pendingFocusTargetRef.current = null;
      focusInsideRef.current = false;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [contentRef, open]);

  return layout;
};
