import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_GAP = 10;
const BOTTOM_GAP = 10;
const KEYBOARD_THRESHOLD = 72;
const CLOSE_THRESHOLD = 32;
const LAYOUT_EPSILON = 2;
const SETTLE_DELAY_MS = 140;
const FINAL_SETTLE_DELAY_MS = 320;
const FOCUS_SCROLL_DELAY_MS = 60;
const FOCUS_SCROLL_SETTLE_DELAY_MS = 240;
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
  /** Высота видимой системной рамки sheet: от safe-area top до клавиатуры/низа экрана. */
  frameHeight: number;
  /** Максимальная высота карточки sheet внутри frame. */
  maxHeight: number;
  /** Фактическая высота клавиатуры/закрытой зоны снизу. Оставлено для совместимости старых файлов. */
  bottomOffset: number;
  /** true, когда keyboard реально открыт. */
  isKeyboardOpen: boolean;
  /** true во время resize/scroll visualViewport, когда не надо включать лишние CSS-анимации. */
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
  if (!rawValue) return fallback;

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
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const wasKeyboardOpen = previousLayout?.isKeyboardOpen ?? false;

  /*
    Когда пользователь переключается input → input, Telegram/iOS иногда на один кадр
    отдаёт keyboardInset = 0. Это не настоящее закрытие клавиатуры, а handoff между
    разными типами клавиатуры. В этот короткий момент удерживаем старую frame-геометрию,
    чтобы sheet не падал вниз и не открывался заново.
  */
  if (wasKeyboardOpen && metrics.keyboardInset <= CLOSE_THRESHOLD && isFieldSwitchHoldActive() && previousLayout) {
    return {
      ...previousLayout,
      isKeyboardOpen: true,
      isViewportChanging,
    };
  }

  const keyboardThreshold = wasKeyboardOpen ? CLOSE_THRESHOLD : KEYBOARD_THRESHOLD;
  const isKeyboardOpen = metrics.keyboardInset > keyboardThreshold;
  const topLimit = getTopLimit();
  const bottomGap = getBottomGap();

  /*
    Системная логика: sheet живёт внутри реально видимой области visualViewport.
    Мы не двигаем саму карточку вверх от клавиатуры. Меняется только frame,
    а карточка остаётся прибитой к низу этого frame — как native bottom sheet.
  */
  const frameTop = normalizePx(metrics.visualOffsetTop + topLimit);
  const availableHeight = Math.floor(metrics.visualHeight - topLimit - bottomGap);
  const frameHeight = Math.max(1, availableHeight);

  return {
    frameTop,
    frameHeight,
    maxHeight: frameHeight,
    bottomOffset: isKeyboardOpen ? metrics.keyboardInset : 0,
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

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));

  if (!layout) return;

  root.style.setProperty("--sheet-frame-top", `${layout.frameTop}px`);
  root.style.setProperty("--sheet-frame-height", `${layout.frameHeight}px`);
  root.style.setProperty("--sheet-keyboard-offset", `${layout.bottomOffset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
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
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

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

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);
      setLayout(nextLayout);
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
        commitLayout(getNextLayout(false, latestLayoutRef.current));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        commitLayout(getNextLayout(false, latestLayoutRef.current));
      }, FINAL_SETTLE_DELAY_MS);
    };

    const lockDocumentScroll = () => {
      if (scrollRafId !== null) return;

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        resetDocumentScroll();
      });
    };

    scheduleLayout();

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

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = 72;

      let nextScrollTop = contentElement.scrollTop;

      if (targetRect.top < contentRect.top + topGap) {
        nextScrollTop += targetRect.top - contentRect.top - topGap;
      } else if (targetRect.bottom > contentRect.bottom - bottomGap) {
        nextScrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      }

      const clampedScrollTop = clampScrollTop(contentElement, nextScrollTop);
      if (Math.abs(clampedScrollTop - contentElement.scrollTop) > 1) {
        contentElement.scrollTop = clampedScrollTop;
      }
    };

    const scheduleFocusedScroll = (target: HTMLElement) => {
      focusedElementRef.current = target;

      if (firstScrollTimerId !== null) window.clearTimeout(firstScrollTimerId);
      if (settleScrollTimerId !== null) window.clearTimeout(settleScrollTimerId);

      firstScrollTimerId = window.setTimeout(() => {
        if (focusedElementRef.current) scrollFocusedFieldIntoView(focusedElementRef.current);
      }, FOCUS_SCROLL_DELAY_MS);

      settleScrollTimerId = window.setTimeout(() => {
        if (focusedElementRef.current) scrollFocusedFieldIntoView(focusedElementRef.current);
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
