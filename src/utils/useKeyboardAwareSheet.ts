import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_GAP = 10;
const BOTTOM_GAP = 10;
const KEYBOARD_THRESHOLD = 72;
const CLOSE_THRESHOLD = 32;
const LAYOUT_EPSILON = 2;
const SETTLE_DELAY_MS = 120;
const FINAL_SETTLE_DELAY_MS = 300;
const FOCUS_SCROLL_DELAY_MS = 40;
const FOCUS_SCROLL_SETTLE_DELAY_MS = 190;
const FIELD_SWITCH_HOLD_MS = 420;

let fieldSwitchHoldUntil = 0;

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
  /** Высота стабильной рамки sheet: от safe-area top до низа WebView. */
  frameHeight: number;
  /** Максимальная высота карточки sheet внутри frame. */
  maxHeight: number;
  /** Фактическая высота клавиатуры/закрытой зоны снизу. */
  bottomOffset: number;
  /** true, когда keyboard реально открыт. */
  isKeyboardOpen: boolean;
  /** true во время resize/scroll visualViewport. */
  isViewportChanging: boolean;
};

type Metrics = {
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue || rawValue.endsWith("dvh") || rawValue.endsWith("vh")) return fallback;

  const numericValue = Number(rawValue.replace("px", ""));
  if (!Number.isFinite(numericValue)) return fallback;

  return Math.max(0, Math.round(numericValue));
};

const getLayoutHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getMetrics = (): Metrics => {
  if (typeof window === "undefined") {
    return {
      layoutHeight: 0,
      visualHeight: 0,
      visualOffsetTop: 0,
      keyboardInset: 0,
    };
  }

  const layoutHeight = getLayoutHeight();
  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height || layoutHeight;
  const visualOffsetTop = visualViewport?.offsetTop || 0;
  const viewportBottom = visualOffsetTop + visualHeight;
  const visualKeyboardInset = normalizePx(layoutHeight - viewportBottom);

  const telegramKeyboardInset = Math.max(
    readRootCssPx("--tg-keyboard-offset", 0),
    readRootCssPx("--app-keyboard-offset", 0),
  );

  return {
    layoutHeight,
    visualHeight,
    visualOffsetTop,
    keyboardInset: Math.max(visualKeyboardInset, telegramKeyboardInset),
  };
};

const getStableHeightCandidate = (metrics: Metrics) => {
  return Math.max(
    metrics.layoutHeight,
    metrics.visualHeight,
    readRootCssPx("--tg-viewport-stable-height", 0),
    readRootCssPx("--app-height", 0),
  );
};

const getTopLimit = () => {
  const telegramContentTop = Math.max(
    readRootCssPx("--app-tg-content-safe-area-inset-top", 0),
    readRootCssPx("--tg-content-safe-area-inset-top", 0),
    readRootCssPx("--app-tg-sheet-top-limit", 0),
  );

  return Math.max(TOP_GAP, telegramContentTop + TOP_GAP);
};

const getBottomGap = () => {
  const telegramBottom = Math.max(
    readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0),
    readRootCssPx("--app-tg-safe-bottom", 0),
    readRootCssPx("--tg-safe-bottom", 0),
  );

  return Math.max(BOTTOM_GAP, telegramBottom + BOTTOM_GAP);
};

const getNextLayout = (
  isViewportChanging = false,
  previousLayout: KeyboardAwareSheetLayout | undefined,
  stableViewportHeight: number,
): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const wasKeyboardOpen = previousLayout?.isKeyboardOpen ?? false;
  const isFieldSwitching = wasKeyboardOpen && metrics.keyboardInset <= CLOSE_THRESHOLD && isFieldSwitchHoldActive();

  const keyboardThreshold = wasKeyboardOpen ? CLOSE_THRESHOLD : KEYBOARD_THRESHOLD;
  const isClosingDuringViewportChange = wasKeyboardOpen && isViewportChanging && metrics.keyboardInset <= CLOSE_THRESHOLD;
  const isKeyboardOpen = isFieldSwitching || isClosingDuringViewportChange || metrics.keyboardInset > keyboardThreshold;
  const topLimit = getTopLimit();
  const bottomGap = getBottomGap();

  /*
    Системный режим без «пиксельного» движения:
    frame НЕ следует за каждым resize visualViewport. Он остаётся стабильным от
    content safe-area top до стабильного низа WebView. Клавиатура учитывается
    только как нижняя закрытая зона внутри sheet через --sheet-keyboard-offset.
    Поэтому карточка не едет по пикселям вместе с клавиатурой, а активное поле
    докручивается внутри sheet, как в нативных формах.
  */
  const frameTop = topLimit;
  const frameHeight = Math.max(1, Math.floor(stableViewportHeight - topLimit - bottomGap));
  const bottomOffset = isKeyboardOpen
    ? Math.max(metrics.keyboardInset, previousLayout?.bottomOffset ?? 0)
    : 0;

  return {
    frameTop,
    frameHeight,
    maxHeight: frameHeight,
    bottomOffset,
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

const writeRootSheetLayout = (layout: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.style.setProperty("--sheet-frame-top", `${layout.frameTop}px`);
  root.style.setProperty("--sheet-frame-height", `${layout.frameHeight}px`);
  root.style.setProperty("--sheet-keyboard-offset", `${layout.bottomOffset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  root.classList.toggle("tg-sheet-viewport-changing", Boolean(isOpen && layout?.isViewportChanging));

  if (!layout) return;

  writeRootSheetLayout(layout);
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
  const initialMetrics = getMetrics();
  const stableViewportHeightRef = useRef(Math.max(1, getStableHeightCandidate(initialMetrics)));
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() =>
    getNextLayout(false, undefined, stableViewportHeightRef.current),
  );
  const latestLayoutRef = useRef(layout);
  const focusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      setRootSheetState(false, latestLayoutRef.current);
      return;
    }

    const refreshStableHeight = () => {
      const metrics = getMetrics();
      const keyboardLooksClosed = metrics.keyboardInset <= CLOSE_THRESHOLD && !isFieldSwitchHoldActive();

      if (keyboardLooksClosed) {
        stableViewportHeightRef.current = Math.max(
          stableViewportHeightRef.current,
          getStableHeightCandidate(metrics),
        );
      }
    };

    refreshStableHeight();
    resetDocumentScroll();
    setRootSheetState(true, latestLayoutRef.current);

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollRafId: number | null = null;

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);
      setLayout(nextLayout);
    };

    const applyChangingLayout = () => {
      rafId = null;
      refreshStableHeight();
      commitLayout(getNextLayout(true, latestLayoutRef.current, stableViewportHeightRef.current));
    };

    const scheduleLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyChangingLayout);
      }

      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);

      settleTimerId = window.setTimeout(() => {
        refreshStableHeight();
        commitLayout(getNextLayout(false, latestLayoutRef.current, stableViewportHeightRef.current));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        refreshStableHeight();
        commitLayout(getNextLayout(false, latestLayoutRef.current, stableViewportHeightRef.current));
      }, FINAL_SETTLE_DELAY_MS);
    };

    const lockDocumentScroll = () => {
      if (scrollRafId !== null) return;

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        resetDocumentScroll();
      });
    };

    commitLayout(getNextLayout(false, latestLayoutRef.current, stableViewportHeightRef.current));

    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);
    window.addEventListener("scroll", lockDocumentScroll, { passive: true });
    document.addEventListener("scroll", lockDocumentScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);

      window.visualViewport?.removeEventListener("resize", scheduleLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleLayout);
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
      const keyboardOffset = readRootCssPx("--sheet-keyboard-offset", 0);
      const topGap = 18;
      const bottomGap = Math.max(72, keyboardOffset + 28);
      const visibleBottom = contentRect.bottom - keyboardOffset;

      let nextScrollTop = contentElement.scrollTop;

      if (targetRect.top < contentRect.top + topGap) {
        nextScrollTop += targetRect.top - contentRect.top - topGap;
      } else if (targetRect.bottom > visibleBottom - 28) {
        nextScrollTop += targetRect.bottom - visibleBottom + bottomGap;
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

    const handlePointerDown = (event: PointerEvent) => {
      if (isEditableElement(event.target)) {
        prepareSheetFieldSwitch();
      }
    };

    const handleInput = () => {
      if (focusedElementRef.current) {
        scheduleFocusedScroll(focusedElementRef.current);
      }
    };

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);
    contentElement.addEventListener("pointerdown", handlePointerDown, { passive: true });
    contentElement.addEventListener("input", handleInput);

    return () => {
      if (firstScrollTimerId !== null) window.clearTimeout(firstScrollTimerId);
      if (settleScrollTimerId !== null) window.clearTimeout(settleScrollTimerId);

      focusedElementRef.current = null;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
      contentElement.removeEventListener("pointerdown", handlePointerDown);
      contentElement.removeEventListener("input", handleInput);
    };
  }, [contentRef, open]);

  return layout;
};
