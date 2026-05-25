import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_OPEN_THRESHOLD = 72;
const KEYBOARD_CLOSE_THRESHOLD = 28;
const LAYOUT_CHANGE_THRESHOLD = 2;
const BACKDROP_CLOSE_IGNORE_MS = 360;
const FOCUS_HANDOFF_MS = 420;
const KEYBOARD_SWAP_HOLD_MS = 520;
const VIEWPORT_SETTLE_MS = 120;
const VIEWPORT_SECOND_SETTLE_MS = 300;
const FOCUS_SCROLL_FAST_MS = 80;
const FOCUS_SCROLL_SETTLED_MS = 260;

export type KeyboardAwareSheetLayout = {
  /** Числовой offset нужен только для условий в компонентах. */
  bottomOffset: number;
  /** Числовой fallback высоты. Основной layout идёт через CSS-переменные. */
  maxHeight: number;
  /** bottom = safe-bottom + актуальный keyboard offset. */
  bottomInsetCss: string;
  /** max-height = stable viewport - safe top - safe bottom - keyboard offset. */
  maxHeightCss: string;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
  isInputFocused: boolean;
};

let ignoreSheetBackdropCloseUntil = 0;

export const markSheetInputInteraction = () => {
  ignoreSheetBackdropCloseUntil = Date.now() + BACKDROP_CLOSE_IGNORE_MS;
};

export const shouldIgnoreSheetBackdropClose = () => Date.now() < ignoreSheetBackdropCloseUntil;

const bottomInsetCss =
  "calc(var(--sheet-bottom-gap, max(10px, calc(var(--app-tg-safe-bottom, env(safe-area-inset-bottom, 0px)) + 10px))) + var(--sheet-effective-keyboard-offset, 0px))";

const maxHeightCss =
  "max(180px, calc(var(--tg-viewport-stable-height, var(--app-height, 100dvh)) - var(--app-tg-sheet-top-limit, 10px) - var(--sheet-bottom-gap, 16px) - var(--sheet-effective-keyboard-offset, 0px)))";

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;

  const numeric = Number(raw.replace("px", ""));
  if (!Number.isFinite(numeric)) return fallback;

  return Math.max(0, Math.round(numeric));
};

const getStableViewportHeight = () => {
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

const getRawKeyboardOffset = (stableHeight: number) => {
  if (typeof window === "undefined") return 0;

  const telegramOffset = Math.max(
    readRootCssPx("--tg-keyboard-offset", 0),
    readRootCssPx("--app-keyboard-offset", 0),
  );

  const visualViewport = window.visualViewport;
  if (!visualViewport) return normalizePx(telegramOffset);

  const visualBottom = visualViewport.offsetTop + visualViewport.height;
  const visualOffset = Math.max(0, stableHeight - visualBottom);

  return normalizePx(Math.max(telegramOffset, visualOffset));
};

const isEditableElement = (target: EventTarget | null) => {
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

const clampScrollTop = (element: HTMLElement, nextScrollTop: number) => {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, Math.round(nextScrollTop)));
};

const makeLayout = (
  bottomOffset: number,
  isKeyboardOpen: boolean,
  isViewportChanging: boolean,
  isInputFocused: boolean,
): KeyboardAwareSheetLayout => {
  const stableHeight = Math.max(1, getStableViewportHeight());
  const topLimit = Math.max(TOP_SAFE_GAP, readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP));
  const bottomGap = Math.max(BOTTOM_SAFE_GAP, readRootCssPx("--sheet-bottom-gap", BOTTOM_SAFE_GAP));
  const maxHeight = Math.max(180, Math.floor(stableHeight - topLimit - bottomGap - bottomOffset));

  return {
    bottomOffset: normalizePx(bottomOffset),
    maxHeight,
    bottomInsetCss,
    maxHeightCss,
    isKeyboardOpen,
    isViewportChanging,
    isInputFocused,
  };
};

const getInitialLayout = () => makeLayout(0, false, false, false);

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
  return (
    Math.abs(first.bottomOffset - second.bottomOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging &&
    first.isInputFocused === second.isInputFocused
  );
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  root.classList.toggle("tg-sheet-viewport-changing", Boolean(isOpen && layout?.isViewportChanging));
  root.classList.toggle("tg-sheet-input-focused", Boolean(isOpen && layout?.isInputFocused));

  if (!isOpen) {
    root.style.setProperty("--sheet-effective-keyboard-offset", "0px");
    root.style.setProperty("--sheet-max-height", "0px");
    return;
  }

  if (layout) {
    root.style.setProperty("--sheet-effective-keyboard-offset", `${normalizePx(layout.bottomOffset)}px`);
    root.style.setProperty("--sheet-max-height", `${normalizePx(layout.maxHeight)}px`);
  }
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(getInitialLayout);
  const latestLayoutRef = useRef(layout);
  const lastKeyboardOffsetRef = useRef(0);
  const rawClosedAtRef = useRef<number | null>(null);
  const focusInsideRef = useRef(false);
  const focusHandoffUntilRef = useRef(0);

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      focusInsideRef.current = false;
      focusHandoffUntilRef.current = 0;
      rawClosedAtRef.current = null;
      lastKeyboardOffsetRef.current = 0;

      const nextLayout = getInitialLayout();
      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      setRootSheetState(false, nextLayout);
      return;
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let secondSettleTimerId: number | null = null;
    let scrollLockRafId: number | null = null;

    const computeLayout = (isViewportChanging: boolean): KeyboardAwareSheetLayout => {
      const stableHeight = Math.max(1, getStableViewportHeight());
      const rawOffset = getRawKeyboardOffset(stableHeight);
      const previousOpen = lastKeyboardOffsetRef.current > KEYBOARD_OPEN_THRESHOLD;
      const rawLooksOpen = rawOffset > (previousOpen ? KEYBOARD_CLOSE_THRESHOLD : KEYBOARD_OPEN_THRESHOLD);
      const now = Date.now();

      if (rawLooksOpen) {
        rawClosedAtRef.current = null;
      } else if (rawClosedAtRef.current === null) {
        rawClosedAtRef.current = now;
      }

      const contentElement = contentRef.current;
      const activeElement = typeof document !== "undefined" ? document.activeElement : null;
      const activeInsideSheet =
        activeElement instanceof HTMLElement && Boolean(contentElement?.contains(activeElement));
      const focusHandoffActive = now < focusHandoffUntilRef.current;
      const inputFocused = focusInsideRef.current || activeInsideSheet || focusHandoffActive;
      const rawClosedForMs = rawClosedAtRef.current === null ? 0 : now - rawClosedAtRef.current;

      let effectiveOffset = 0;

      if (rawLooksOpen) {
        effectiveOffset = rawOffset;
      } else if (
        previousOpen &&
        inputFocused &&
        rawClosedForMs <= KEYBOARD_SWAP_HOLD_MS
      ) {
        effectiveOffset = lastKeyboardOffsetRef.current;
      }

      effectiveOffset = normalizePx(effectiveOffset);

      if (effectiveOffset > KEYBOARD_OPEN_THRESHOLD) {
        lastKeyboardOffsetRef.current = effectiveOffset;
      } else if (!inputFocused || rawClosedForMs > KEYBOARD_SWAP_HOLD_MS) {
        lastKeyboardOffsetRef.current = 0;
      }

      return makeLayout(
        effectiveOffset,
        effectiveOffset > KEYBOARD_OPEN_THRESHOLD,
        isViewportChanging,
        activeInsideSheet,
      );
    };

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      /*
        CSS-переменную обновляем на каждом viewport-событии, чтобы sheet шёл за
        клавиатурой без React-render на каждый пиксель. React state меняем только
        когда реально изменились флаги/высота.
      */
      setRootSheetState(true, nextLayout);

      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const flushViewportChangingLayout = () => {
      rafId = null;
      commitLayout(computeLayout(true));
    };

    const scheduleLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(flushViewportChangingLayout);
      }

      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (secondSettleTimerId !== null) window.clearTimeout(secondSettleTimerId);

      settleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, VIEWPORT_SETTLE_MS);

      secondSettleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, VIEWPORT_SECOND_SETTLE_MS);
    };

    const lockGlobalScroll = () => {
      if (scrollLockRafId !== null) return;

      scrollLockRafId = window.requestAnimationFrame(() => {
        scrollLockRafId = null;
        resetDocumentScroll();
      });
    };

    setRootSheetState(true, latestLayoutRef.current);
    resetDocumentScroll();
    scheduleLayout();

    window.addEventListener("app:telegram-viewport-change", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);
    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    window.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("scroll", lockGlobalScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (secondSettleTimerId !== null) window.clearTimeout(secondSettleTimerId);
      if (scrollLockRafId !== null) window.cancelAnimationFrame(scrollLockRafId);

      window.removeEventListener("app:telegram-viewport-change", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("orientationchange", scheduleLayout);
      window.visualViewport?.removeEventListener("resize", scheduleLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("scroll", lockGlobalScroll);
    };
  }, [contentRef, open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusFastTimerId: number | null = null;
    let focusSettledTimerId: number | null = null;
    let focusOutTimerId: number | null = null;

    const dispatchViewportChange = () => {
      window.dispatchEvent(new CustomEvent("app:telegram-viewport-change"));
    };

    const scrollFocusedFieldIntoView = (target: HTMLElement, behavior: ScrollBehavior) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = 84;

      let nextScrollTop = contentElement.scrollTop;

      if (targetRect.top < contentRect.top + topGap) {
        nextScrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.top - contentRect.top - topGap,
        );
      } else if (targetRect.bottom > contentRect.bottom - bottomGap) {
        nextScrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.bottom - contentRect.bottom + bottomGap,
        );
      }

      if (Math.abs(nextScrollTop - contentElement.scrollTop) <= 1) return;

      try {
        contentElement.scrollTo({ top: nextScrollTop, behavior });
      } catch {
        contentElement.scrollTop = nextScrollTop;
      }
    };

    const scheduleFocusScroll = (target: HTMLElement) => {
      if (focusFastTimerId !== null) window.clearTimeout(focusFastTimerId);
      if (focusSettledTimerId !== null) window.clearTimeout(focusSettledTimerId);

      focusFastTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target, "auto");
      }, FOCUS_SCROLL_FAST_MS);

      focusSettledTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target, "smooth");
      }, FOCUS_SCROLL_SETTLED_MS);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
        focusOutTimerId = null;
      }

      focusInsideRef.current = true;
      focusHandoffUntilRef.current = Date.now() + FOCUS_HANDOFF_MS;
      markSheetInputInteraction();
      resetDocumentScroll();
      dispatchViewportChange();
      scheduleFocusScroll(target);
    };

    const handleFocusOut = () => {
      focusHandoffUntilRef.current = Date.now() + FOCUS_HANDOFF_MS;

      if (focusOutTimerId !== null) window.clearTimeout(focusOutTimerId);

      focusOutTimerId = window.setTimeout(() => {
        const activeElement = document.activeElement;
        focusInsideRef.current =
          activeElement instanceof HTMLElement && contentElement.contains(activeElement);
        dispatchViewportChange();
      }, 96);

      dispatchViewportChange();
    };

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);

    return () => {
      if (focusFastTimerId !== null) window.clearTimeout(focusFastTimerId);
      if (focusSettledTimerId !== null) window.clearTimeout(focusSettledTimerId);
      if (focusOutTimerId !== null) window.clearTimeout(focusOutTimerId);

      focusInsideRef.current = false;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [contentRef, open]);

  return layout;
};
