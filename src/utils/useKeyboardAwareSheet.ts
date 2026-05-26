import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const BACKDROP_CLOSE_IGNORE_MS = 320;
const KEYBOARD_OPEN_THRESHOLD = 82;
const LAYOUT_CHANGE_THRESHOLD = 4;
const SETTLE_DELAY_MS = 140;
const FINAL_SETTLE_DELAY_MS = 420;
const CLOSED_LAYOUT_RESET_DELAY_MS = 260;
const FOCUS_SCROLL_DELAY_MS = 120;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 360;

export type KeyboardAwareSheetLayout = {
  /** Смещение visualViewport сверху. Обычно 0 в Telegram, но на iOS может отличаться. */
  viewportTop: number;
  /** Реально видимая высота WebView: когда клавиатура открыта, это место над клавиатурой. */
  viewportHeight: number;
  /** Верхний внутренний отступ до content safe-area. */
  topInset: number;
  /** Нижний safe-area отступ внутри видимой области. */
  bottomInset: number;
  /** Максимальная высота самой панели внутри видимой области. */
  maxHeight: number;
  /** true, когда keyboard занимает нижнюю часть экрана. */
  isKeyboardOpen: boolean;
  /** true во время resize/scroll visualViewport. В этот момент не анимируем layout. */
  isViewportChanging: boolean;
  /** Нижняя fixed-подложка: держится чуть дольше, чтобы при закрытии клавиатуры не просвечивал экран. */
  keyboardGuardOffset: number;
  /** Совместимость со старыми компонентами. В новой схеме sheet не поднимается bottom-offset'ом. */
  bottomOffset: number;
};

type ViewportSnapshot = {
  stableHeight: number;
  visibleHeight: number;
  viewportTop: number;
  keyboardOffset: number;
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

const getWindowInnerHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(window.innerHeight || document.documentElement.clientHeight || 0);
};

const getViewportSnapshot = (): ViewportSnapshot => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      stableHeight: 0,
      visibleHeight: 0,
      viewportTop: 0,
      keyboardOffset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = normalizePx(visualViewport?.height ?? 0);
  const visualOffsetTop = normalizePx(visualViewport?.offsetTop ?? 0);
  const cssViewportHeight = readRootCssPx("--tg-viewport-height", 0);
  const cssStableHeight = readRootCssPx("--tg-viewport-stable-height", 0);
  const cssKeyboardOffset = readRootCssPx("--tg-keyboard-offset", 0);
  const innerHeight = getWindowInnerHeight();

  const stableHeight = Math.max(
    cssStableHeight,
    innerHeight,
    visualHeight,
    cssViewportHeight,
    1,
  );

  const visibleCandidates = [visualHeight, cssViewportHeight]
    .filter((value) => value > 0 && value <= stableHeight + 2);
  const visibleHeightFromViewport = visibleCandidates.length > 0
    ? Math.min(...visibleCandidates)
    : stableHeight;

  const keyboardFromVisualViewport = visualHeight > 0
    ? Math.max(0, stableHeight - (visualOffsetTop + visualHeight))
    : 0;
  const keyboardFromVisibleHeight = Math.max(0, stableHeight - visibleHeightFromViewport);
  const keyboardOffset = normalizePx(Math.max(
    cssKeyboardOffset,
    keyboardFromVisualViewport,
    keyboardFromVisibleHeight,
  ));

  const isKeyboardLikelyOpen = keyboardOffset > KEYBOARD_OPEN_THRESHOLD;

  /*
    Главное отличие новой механики:
    sheet не двигается bottom/translateY. Мы создаём fixed-слой высотой ровно
    в видимую часть WebView. Если Telegram отдал только keyboardOffset, но не
    уменьшил visualViewport, видимую высоту считаем как stable - keyboardOffset.
  */
  const visibleHeight = isKeyboardLikelyOpen
    ? Math.max(280, Math.min(visibleHeightFromViewport, stableHeight - keyboardOffset))
    : Math.max(280, Math.min(stableHeight, visibleHeightFromViewport));

  return {
    stableHeight,
    visibleHeight: normalizePx(visibleHeight),
    viewportTop: visualOffsetTop,
    keyboardOffset,
  };
};

const getInsets = (viewportTop: number) => {
  const contentSafeTop = Math.max(
    readRootCssPx("--app-tg-content-safe-area-inset-top", 0),
    readRootCssPx("--tg-content-safe-area-inset-top", 0),
  );

  const sheetTopLimit = Math.max(
    TOP_SAFE_GAP,
    readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP),
    contentSafeTop + TOP_SAFE_GAP,
  );

  const bottomInset = Math.max(
    BOTTOM_SAFE_GAP,
    readRootCssPx("--sheet-bottom-gap", 0),
    readRootCssPx("--app-tg-safe-bottom", 0) + BOTTOM_SAFE_GAP,
  );

  return {
    topInset: Math.max(TOP_SAFE_GAP, sheetTopLimit - viewportTop),
    bottomInset,
  };
};

const getNextLayout = (
  isViewportChanging = false,
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const snapshot = getViewportSnapshot();
  const isKeyboardOpen = snapshot.keyboardOffset > KEYBOARD_OPEN_THRESHOLD;
  const { topInset, bottomInset } = getInsets(snapshot.viewportTop);

  const maxHeight = Math.max(
    180,
    Math.floor(snapshot.visibleHeight - topInset - bottomInset),
  );

  const previousGuardOffset = previousLayout?.keyboardGuardOffset ?? 0;
  const shouldHoldGuardDuringClose =
    !isKeyboardOpen &&
    previousGuardOffset > 0 &&
    (isViewportChanging || Boolean(previousLayout?.isViewportChanging));

  return {
    viewportTop: snapshot.viewportTop,
    viewportHeight: snapshot.visibleHeight,
    topInset,
    bottomInset,
    bottomOffset: 0,
    keyboardGuardOffset: isKeyboardOpen
      ? snapshot.keyboardOffset
      : shouldHoldGuardDuringClose
        ? previousGuardOffset
        : 0,
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
    Math.abs(first.viewportTop - second.viewportTop) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.viewportHeight - second.viewportHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.topInset - second.topInset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.bottomInset - second.bottomInset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.keyboardGuardOffset - second.keyboardGuardOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging
  );
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));

  if (layout) {
    root.style.setProperty("--sheet-viewport-top", `${normalizePx(layout.viewportTop)}px`);
    root.style.setProperty("--sheet-viewport-height", `${normalizePx(layout.viewportHeight)}px`);
    root.style.setProperty("--sheet-top-inset", `${normalizePx(layout.topInset)}px`);
    root.style.setProperty("--sheet-bottom-inset", `${normalizePx(layout.bottomInset)}px`);
    root.style.setProperty("--sheet-keyboard-offset", "0px");
    root.style.setProperty("--sheet-keyboard-guard-offset", `${normalizePx(layout.keyboardGuardOffset)}px`);
    root.style.setProperty("--sheet-max-height", `${normalizePx(layout.maxHeight)}px`);
  }
};

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
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
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      setRootSheetState(false, latestLayoutRef.current);

      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getNextLayout(false, latestLayoutRef.current);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
      }, CLOSED_LAYOUT_RESET_DELAY_MS);

      return () => {
        window.clearTimeout(resetTimerId);
      };
    }

    setRootSheetState(true, latestLayoutRef.current);
    resetDocumentScroll();

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollLockRafId: number | null = null;

    const setNextLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);
      setLayout(nextLayout);
    };

    const applyChangingLayout = () => {
      rafId = null;
      setNextLayout(getNextLayout(true, latestLayoutRef.current));
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
        setNextLayout(getNextLayout(false, latestLayoutRef.current));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        setNextLayout(getNextLayout(false, latestLayoutRef.current));
      }, FINAL_SETTLE_DELAY_MS);
    };

    scheduleChangingLayout();

    const lockGlobalScroll = () => {
      if (scrollLockRafId !== null) return;

      scrollLockRafId = window.requestAnimationFrame(() => {
        scrollLockRafId = null;
        resetDocumentScroll();
      });
    };

    window.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("scroll", lockGlobalScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleChangingLayout);
    window.visualViewport?.addEventListener("scroll", scheduleChangingLayout);
    window.addEventListener("resize", scheduleChangingLayout);
    window.addEventListener("orientationchange", scheduleChangingLayout);
    window.addEventListener("app:telegram-viewport-change", scheduleChangingLayout);

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

      if (scrollLockRafId !== null) {
        window.cancelAnimationFrame(scrollLockRafId);
      }

      window.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("scroll", lockGlobalScroll);
      window.visualViewport?.removeEventListener("resize", scheduleChangingLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleChangingLayout);
      window.removeEventListener("resize", scheduleChangingLayout);
      window.removeEventListener("orientationchange", scheduleChangingLayout);
      window.removeEventListener("app:telegram-viewport-change", scheduleChangingLayout);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimerId: number | null = null;
    let settleFocusTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 16;
      const bottomGap = 64;

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
      resetDocumentScroll();

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
