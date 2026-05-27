import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_GAP = 10;
const BOTTOM_GAP = 10;
const MIN_KEYBOARD_CARD_HEIGHT = 132;
const MAX_VISUAL_TOP_OFFSET = 120;
const KEYBOARD_THRESHOLD = 72;
const CLOSE_THRESHOLD = 32;
const MAX_KEYBOARD_OFFSET = 620;
const KEYBOARD_OFFSET_STEP = 4;
const LAYOUT_EPSILON = 1;
const SETTLE_DELAY_MS = 140;
const FINAL_SETTLE_DELAY_MS = 320;
const FOCUS_SCROLL_DELAY_MS = 70;
const FOCUS_SCROLL_SETTLE_DELAY_MS = 260;
const FIELD_SWITCH_HOLD_MS = 460;

let fieldSwitchHoldUntil = 0;

export const prepareSheetFieldSwitch = (holdMs = FIELD_SWITCH_HOLD_MS) => {
  if (typeof window === "undefined") return;

  fieldSwitchHoldUntil = Date.now() + holdMs;
};

const isFieldSwitchHoldActive = () => {
  return typeof window !== "undefined" && Date.now() < fieldSwitchHoldUntil;
};

export type KeyboardAwareSheetLayout = {
  /** Стабильный верх frame. В v13 он не анимируется во время клавиатуры. */
  frameTop: number;
  /** Стабильная высота frame. В v13 она не догоняет viewport по каждому пикселю. */
  frameHeight: number;
  /** Максимальная высота карточки sheet внутри frame. */
  maxHeight: number;
  /** Насколько карточку sheet нужно поднять над клавиатурой. */
  bottomOffset: number;
  /** true, когда клавиатура реально открыта. */
  isKeyboardOpen: boolean;
  /** true во время resize/scroll visualViewport. Оставлено для совместимости компонентов. */
  isViewportChanging: boolean;
};

type Metrics = {
  stableHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return fallback;

  const numericValue = Number(rawValue.replace("px", ""));
  if (!Number.isFinite(numericValue)) return fallback;

  return Math.max(0, Math.round(numericValue));
};

const getDocumentHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    readRootCssPx("--tg-viewport-stable-height", 0),
    readRootCssPx("--app-height", 0),
  );
};

const readVisualViewport = () => {
  if (typeof window === "undefined") {
    return {
      height: 0,
      offsetTop: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const fallbackHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  if (!visualViewport) {
    return {
      height: normalizePx(readRootCssPx("--tg-viewport-height", fallbackHeight)),
      offsetTop: 0,
    };
  }

  return {
    height: normalizePx(visualViewport.height),
    offsetTop: normalizePx(visualViewport.offsetTop),
  };
};

const roundKeyboardInset = (value: number) => {
  if (value <= 0) return 0;

  return Math.round(value / KEYBOARD_OFFSET_STEP) * KEYBOARD_OFFSET_STEP;
};

const getMetrics = (): Metrics => {
  if (typeof window === "undefined") {
    return {
      stableHeight: 0,
      visualHeight: 0,
      visualOffsetTop: 0,
      keyboardInset: 0,
    };
  }

  const visual = readVisualViewport();
  const stableHeight = Math.max(getDocumentHeight(), visual.height, 1);
  const visualBottom = visual.offsetTop + visual.height;

  const visualKeyboardInset = normalizePx(stableHeight - visualBottom);
  const telegramKeyboardInset = readRootCssPx("--tg-keyboard-offset", 0);

  const keyboardInset = clamp(
    roundKeyboardInset(Math.max(visualKeyboardInset, telegramKeyboardInset)),
    0,
    Math.min(MAX_KEYBOARD_OFFSET, stableHeight),
  );

  return {
    stableHeight,
    visualHeight: visual.height,
    visualOffsetTop: visual.offsetTop,
    keyboardInset,
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
    readRootCssPx("--sheet-bottom-gap", 0),
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
    При переключении input → input Telegram/iOS иногда на 1 кадр отдаёт keyboardInset = 0.
    Это не настоящее закрытие клавиатуры. Удерживаем старую геометрию, чтобы sheet не падал вниз.
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
  const keyboardInset = isKeyboardOpen ? metrics.keyboardInset : 0;

  const topLimit = getTopLimit();
  const bottomGap = getBottomGap();
  const visualTopOffset = isKeyboardOpen
    ? clamp(metrics.visualOffsetTop, 0, MAX_VISUAL_TOP_OFFSET)
    : 0;

  /*
    v14: верх frame учитывает не только Telegram contentSafeAreaInset.top,
    но и visualViewport.offsetTop. Иначе на iOS/Telegram при клавиатуре
    карточка может визуально залезть под верхнюю content safe-area.
  */
  const frameTop = topLimit + visualTopOffset;
  const frameHeight = Math.max(
    MIN_KEYBOARD_CARD_HEIGHT,
    Math.floor(metrics.stableHeight - frameTop - bottomGap),
  );

  const availableAboveKeyboard = Math.max(
    0,
    Math.floor(frameHeight - keyboardInset),
  );

  /*
    Если места над клавиатурой меньше 220px, не пробиваем верхнюю safe-area.
    Лучше ужать Import/Create sheet и оставить внутренний scroll, чем увести
    шапку sheet под Telegram top bar.
  */
  const keyboardMaxHeight = Math.max(
    0,
    Math.min(frameHeight, availableAboveKeyboard),
  );

  const maxHeight = isKeyboardOpen ? keyboardMaxHeight : frameHeight;

  return {
    frameTop,
    frameHeight,
    maxHeight,
    bottomOffset: keyboardInset,
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

  if (!isOpen) {
    root.style.setProperty("--sheet-keyboard-offset", "0px");
    root.style.setProperty("--sheet-max-height", "0px");
    return;
  }

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

const scrollContentTo = (element: HTMLElement, top: number) => {
  try {
    element.scrollTo({ top, behavior: "smooth" });
  } catch {
    element.scrollTop = top;
  }
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

      const wasOpen = latestLayoutRef.current.isKeyboardOpen;
      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);

      // setLayout (React re-render) только при смене isKeyboardOpen.
      // Иначе 60 re-renders/сек во время анимации клавиатуры перезапускают
      // CSS transition на каждом кадре и дают дёргание.
      if (nextLayout.isKeyboardOpen !== wasOpen) {
        setLayout(nextLayout);
      }
    };

    const flushLayout = () => {
      setLayout({ ...latestLayoutRef.current, isViewportChanging: false });
    };

    const applyChangingLayout = () => {
      rafId = null;
      commitLayout(getNextLayout(true, latestLayoutRef.current));
    };

    const applyStableLayout = () => {
      const next = getNextLayout(false, latestLayoutRef.current);
      if (!isSameLayout(latestLayoutRef.current, next)) {
        latestLayoutRef.current = next;
        setRootSheetState(true, next);
      }
      flushLayout();
    };

    const scheduleLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyChangingLayout);
      }

      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);

      settleTimerId = window.setTimeout(applyStableLayout, SETTLE_DELAY_MS);
      finalSettleTimerId = window.setTimeout(applyStableLayout, FINAL_SETTLE_DELAY_MS);
    };

    const lockDocumentScroll = () => {
      if (scrollRafId !== null) return;

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        resetDocumentScroll();
      });
    };

    scheduleLayout();
    window.setTimeout(applyStableLayout, 80);
    window.setTimeout(applyStableLayout, 240);

    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);
    window.addEventListener("app:telegram-viewport-change", scheduleLayout);
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
      window.removeEventListener("app:telegram-viewport-change", scheduleLayout);
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
      const bottomGap = latestLayoutRef.current.isKeyboardOpen ? 96 : 72;

      let nextScrollTop = contentElement.scrollTop;

      if (targetRect.top < contentRect.top + topGap) {
        nextScrollTop += targetRect.top - contentRect.top - topGap;
      } else if (targetRect.bottom > contentRect.bottom - bottomGap) {
        nextScrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      }

      const clampedScrollTop = clampScrollTop(contentElement, nextScrollTop);
      if (Math.abs(clampedScrollTop - contentElement.scrollTop) > 1) {
        scrollContentTo(contentElement, clampedScrollTop);
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