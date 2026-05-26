import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_GAP = 10;
const BOTTOM_GAP = 10;
const KEYBOARD_OPEN_THRESHOLD = 72;
const KEYBOARD_CLOSE_THRESHOLD = 32;
const LAYOUT_EPSILON = 2;
const SETTLE_DELAY_MS = 120;
const FINAL_SETTLE_DELAY_MS = 280;
const FIELD_SWITCH_HOLD_MS = 460;
const FOCUS_SCROLL_DELAY_MS = 50;
const FOCUS_SCROLL_SETTLE_DELAY_MS = 230;
const GUARD_RELEASE_DELAY_MS = 260;

let fieldSwitchHoldUntil = 0;
let lastKnownKeyboardOffset = 0;
let guardReleaseTimerId: number | null = null;

export const prepareSheetFieldSwitch = (holdMs = FIELD_SWITCH_HOLD_MS) => {
  if (typeof window === "undefined") return;

  fieldSwitchHoldUntil = Date.now() + holdMs;
};

const isFieldSwitchHoldActive = () => {
  return typeof window !== "undefined" && Date.now() < fieldSwitchHoldUntil;
};

export type KeyboardAwareSheetLayout = {
  /** Верх системной рамки sheet внутри Telegram WebView. */
  frameTop: number;
  /** Высота видимой системной рамки sheet: от safe-area top до клавиатуры/низа экрана. */
  frameHeight: number;
  /** Максимальная высота карточки sheet внутри frame. */
  maxHeight: number;
  /** Фактическая высота клавиатуры/закрытой зоны снизу. */
  bottomOffset: number;
  /** true, когда keyboard реально открыт. */
  isKeyboardOpen: boolean;
  /** true, пока Telegram/WebView пересчитывает viewport. */
  isViewportChanging: boolean;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      viewportHeight?: number;
      viewportStableHeight?: number;
    };
  };
};

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

const getWindowHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0),
  );
};

const getTelegramViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  const tg = (window as TelegramWindow).Telegram?.WebApp;

  return normalizePx(
    Math.max(
      readRootCssPx("--tg-viewport-height", 0),
      tg?.viewportHeight ?? 0,
      1,
    ),
  );
};

const getTelegramStableHeight = () => {
  if (typeof window === "undefined") return 0;

  const tg = (window as TelegramWindow).Telegram?.WebApp;
  const windowHeight = getWindowHeight();

  return normalizePx(
    Math.max(
      readRootCssPx("--tg-viewport-stable-height", 0),
      tg?.viewportStableHeight ?? 0,
      windowHeight,
      1,
    ),
  );
};

const getTelegramKeyboardOffset = (stableHeight: number, viewportHeight: number) => {
  const explicitOffset = Math.max(
    readRootCssPx("--tg-keyboard-offset", 0),
    readRootCssPx("--app-keyboard-offset", 0),
  );

  const derivedOffset = normalizePx(stableHeight - viewportHeight);

  return Math.max(explicitOffset, derivedOffset, 0);
};

const getTopLimit = () => {
  const contentTop = Math.max(
    readRootCssPx("--app-tg-content-safe-area-inset-top", 0),
    readRootCssPx("--tg-content-safe-area-inset-top", 0),
  );

  return Math.max(
    TOP_GAP,
    readRootCssPx("--app-tg-sheet-top-limit", 0),
    contentTop + TOP_GAP,
  );
};

const getBottomGap = () => {
  const safeBottom = Math.max(
    readRootCssPx("--sheet-bottom-gap", 0),
    readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0) + BOTTOM_GAP,
    readRootCssPx("--app-tg-safe-bottom", 0) + BOTTOM_GAP,
    readRootCssPx("--tg-safe-bottom", 0) + BOTTOM_GAP,
  );

  return Math.max(BOTTOM_GAP, safeBottom);
};

const getVisibleHeight = (stableHeight: number, viewportHeight: number, keyboardOffset: number) => {
  const viewportBasedHeight = viewportHeight > 0 ? viewportHeight : stableHeight;
  const keyboardBasedHeight = keyboardOffset > KEYBOARD_CLOSE_THRESHOLD
    ? stableHeight - keyboardOffset
    : stableHeight;

  return normalizePx(Math.max(1, Math.min(stableHeight, viewportBasedHeight, keyboardBasedHeight)));
};

const holdGuardOffset = (offset: number) => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const root = document.documentElement;

  if (guardReleaseTimerId !== null) {
    window.clearTimeout(guardReleaseTimerId);
    guardReleaseTimerId = null;
  }

  if (offset > 0) {
    lastKnownKeyboardOffset = Math.max(lastKnownKeyboardOffset, offset);
    root.style.setProperty("--sheet-guard-offset", `${lastKnownKeyboardOffset}px`);
    return;
  }

  const offsetToHold = lastKnownKeyboardOffset;
  root.style.setProperty("--sheet-guard-offset", `${offsetToHold}px`);

  guardReleaseTimerId = window.setTimeout(() => {
    lastKnownKeyboardOffset = 0;
    root.style.setProperty("--sheet-guard-offset", "0px");
    guardReleaseTimerId = null;
  }, GUARD_RELEASE_DELAY_MS);
};

const getNextLayout = (
  isViewportChanging = false,
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const stableHeight = getTelegramStableHeight();
  const viewportHeight = getTelegramViewportHeight() || stableHeight;
  const measuredKeyboardOffset = getTelegramKeyboardOffset(stableHeight, viewportHeight);
  const wasKeyboardOpen = previousLayout?.isKeyboardOpen ?? false;
  const isFieldSwitching =
    wasKeyboardOpen &&
    measuredKeyboardOffset <= KEYBOARD_CLOSE_THRESHOLD &&
    isFieldSwitchHoldActive();

  if (isFieldSwitching && previousLayout) {
    holdGuardOffset(previousLayout.bottomOffset);

    return {
      ...previousLayout,
      isKeyboardOpen: true,
      isViewportChanging,
    };
  }

  const openThreshold = wasKeyboardOpen ? KEYBOARD_CLOSE_THRESHOLD : KEYBOARD_OPEN_THRESHOLD;
  const isKeyboardOpen = measuredKeyboardOffset > openThreshold;
  const keyboardOffset = isKeyboardOpen ? measuredKeyboardOffset : 0;
  const topLimit = getTopLimit();
  const bottomGap = getBottomGap();
  const visibleHeight = getVisibleHeight(stableHeight, viewportHeight, measuredKeyboardOffset);
  const availableHeight = normalizePx(visibleHeight - topLimit - bottomGap);
  const frameHeight = Math.max(1, availableHeight);

  holdGuardOffset(keyboardOffset);

  return {
    frameTop: topLimit,
    frameHeight,
    maxHeight: frameHeight,
    bottomOffset: keyboardOffset,
    isKeyboardOpen,
    isViewportChanging,
  };
};

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
  return (
    Math.abs(first.frameTop - second.frameTop) <= LAYOUT_EPSILON &&
    Math.abs(first.frameHeight - second.frameHeight) <= LAYOUT_EPSILON &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_EPSILON &&
    Math.abs(first.bottomOffset - second.bottomOffset) <= LAYOUT_EPSILON &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging
  );
};

const shouldSyncReactLayout = (
  previousLayout: KeyboardAwareSheetLayout,
  nextLayout: KeyboardAwareSheetLayout,
  force = false,
) => {
  if (force) return true;

  return (
    previousLayout.isKeyboardOpen !== nextLayout.isKeyboardOpen ||
    previousLayout.isViewportChanging !== nextLayout.isViewportChanging
  );
};

const writeRootSheetLayout = (layout: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.style.setProperty("--sheet-frame-top", `${layout.frameTop}px`);
  root.style.setProperty("--sheet-frame-height", `${layout.frameHeight}px`);
  root.style.setProperty("--sheet-keyboard-offset", `${layout.bottomOffset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
};

const setRootSheetClasses = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  root.classList.toggle("tg-sheet-viewport-changing", Boolean(isOpen && layout?.isViewportChanging));
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  setRootSheetClasses(isOpen, layout);

  if (!layout) return;

  writeRootSheetLayout(layout);
  holdGuardOffset(isOpen ? layout.bottomOffset : 0);
};

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isEditableElement = (target: EventTarget | null) => {
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
  const focusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setRootSheetState(open, latestLayoutRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setRootSheetState(false, latestLayoutRef.current);
      return;
    }

    resetDocumentScroll();
    setRootSheetState(true, latestLayoutRef.current);

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollRafId: number | null = null;

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout, forceReactSync = false) => {
      const previousLayout = latestLayoutRef.current;
      if (isSameLayout(previousLayout, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);

      if (shouldSyncReactLayout(previousLayout, nextLayout, forceReactSync)) {
        setLayout(nextLayout);
      }
    };

    const applyChangingLayout = () => {
      rafId = null;
      commitLayout(getNextLayout(true, latestLayoutRef.current));
    };

    const scheduleLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyChangingLayout);
      }

      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);

      settleTimerId = window.setTimeout(() => {
        commitLayout(getNextLayout(false, latestLayoutRef.current), true);
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        commitLayout(getNextLayout(false, latestLayoutRef.current), true);
      }, FINAL_SETTLE_DELAY_MS);
    };

    const lockDocumentScroll = () => {
      if (scrollRafId !== null) return;

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        resetDocumentScroll();
      });
    };

    commitLayout(getNextLayout(false, latestLayoutRef.current), true);

    window.addEventListener("app:telegram-viewport-change", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);
    window.addEventListener("scroll", lockDocumentScroll, { passive: true });
    document.addEventListener("scroll", lockDocumentScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);

      window.removeEventListener("app:telegram-viewport-change", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("orientationchange", scheduleLayout);
      window.removeEventListener("scroll", lockDocumentScroll);
      document.removeEventListener("scroll", lockDocumentScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let firstScrollTimerId: number | null = null;
    let settleScrollTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement, smooth = false) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = 76;

      let nextScrollTop = contentElement.scrollTop;

      if (targetRect.top < contentRect.top + topGap) {
        nextScrollTop += targetRect.top - contentRect.top - topGap;
      } else if (targetRect.bottom > contentRect.bottom - bottomGap) {
        nextScrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      }

      const clampedScrollTop = clampScrollTop(contentElement, nextScrollTop);
      if (Math.abs(clampedScrollTop - contentElement.scrollTop) <= 1) return;

      if (!smooth) {
        contentElement.scrollTop = clampedScrollTop;
        return;
      }

      try {
        contentElement.scrollTo({ top: clampedScrollTop, behavior: "smooth" });
      } catch {
        contentElement.scrollTop = clampedScrollTop;
      }
    };

    const scheduleFocusedScroll = (target: HTMLElement) => {
      focusedElementRef.current = target;

      if (firstScrollTimerId !== null) window.clearTimeout(firstScrollTimerId);
      if (settleScrollTimerId !== null) window.clearTimeout(settleScrollTimerId);

      firstScrollTimerId = window.setTimeout(() => {
        if (focusedElementRef.current) scrollFocusedFieldIntoView(focusedElementRef.current, false);
      }, FOCUS_SCROLL_DELAY_MS);

      settleScrollTimerId = window.setTimeout(() => {
        if (focusedElementRef.current) scrollFocusedFieldIntoView(focusedElementRef.current, true);
      }, FOCUS_SCROLL_SETTLE_DELAY_MS);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      resetDocumentScroll();
      prepareSheetFieldSwitch(260);
      scheduleFocusedScroll(target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;

      if (nextTarget instanceof HTMLElement && contentElement.contains(nextTarget)) {
        prepareSheetFieldSwitch();
        return;
      }

      focusedElementRef.current = null;
    };

    const handleInput = () => {
      if (focusedElementRef.current) {
        scheduleFocusedScroll(focusedElementRef.current);
      }
    };

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);
    contentElement.addEventListener("input", handleInput);

    return () => {
      if (firstScrollTimerId !== null) window.clearTimeout(firstScrollTimerId);
      if (settleScrollTimerId !== null) window.clearTimeout(settleScrollTimerId);

      focusedElementRef.current = null;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
      contentElement.removeEventListener("input", handleInput);
    };
  }, [contentRef, open]);

  return layout;
};
