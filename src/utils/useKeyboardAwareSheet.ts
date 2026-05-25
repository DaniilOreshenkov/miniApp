import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const BACKDROP_CLOSE_IGNORE_MS = 360;
const KEYBOARD_OPEN_THRESHOLD = 72;
const KEYBOARD_CLOSE_THRESHOLD = 24;
const LAYOUT_CHANGE_THRESHOLD = 2;
const FOCUS_HANDOFF_MS = 260;
const VIEWPORT_SETTLE_MS = 180;
const FOCUS_SCROLL_DELAY_MS = 140;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 340;

export type KeyboardAwareSheetLayout = {
  /** Нижний отступ sheet от нижней safe-area. Равен высоте клавиатуры, когда она открыта. */
  bottomOffset: number;
  /** Максимальная высота панели внутри safe-area и над клавиатурой. */
  maxHeight: number;
  /** true, когда клавиатура считается открытой или идёт короткая передача фокуса между input. */
  isKeyboardOpen: boolean;
  /** true во время resize/scroll visualViewport. Нужен только для лёгких CSS hints. */
  isViewportChanging: boolean;
};

type ViewportMetrics = {
  stableHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  visualBottom: number;
  keyboardInset: number;
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
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      window.visualViewport?.height || 0,
    ),
  );
};

const getStableViewportHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const visualViewport = window.visualViewport;
  const visualBottom = visualViewport
    ? visualViewport.offsetTop + visualViewport.height
    : window.innerHeight;

  return normalizePx(
    Math.max(
      readRootCssPx("--tg-viewport-stable-height", 0),
      readRootCssPx("--app-height", 0),
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      visualBottom || 0,
    ),
  );
};

const getViewportMetrics = (): ViewportMetrics => {
  const stableHeight = Math.max(getStableViewportHeight(), getLayoutViewportHeight(), 1);

  if (typeof window === "undefined") {
    return {
      stableHeight,
      visualHeight: stableHeight,
      visualOffsetTop: 0,
      visualBottom: stableHeight,
      keyboardInset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = normalizePx(visualViewport?.height ?? stableHeight);
  const visualOffsetTop = normalizePx(visualViewport?.offsetTop ?? 0);
  const visualBottom = normalizePx(visualOffsetTop + visualHeight);

  /*
    Берём Telegram CSS-переменную --tg-keyboard-offset как внешний источник,
    но не читаем --sheet-keyboard-offset, потому что её выставляет сам sheet.
    Так offset не может сам себя подпитывать и залипать после закрытия клавиатуры.
  */
  const telegramKeyboardInset = readRootCssPx("--tg-keyboard-offset", 0);
  const visualKeyboardInset = normalizePx(stableHeight - visualBottom);

  return {
    stableHeight,
    visualHeight,
    visualOffsetTop,
    visualBottom,
    keyboardInset: normalizePx(Math.max(telegramKeyboardInset, visualKeyboardInset)),
  };
};

const isFocusableField = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
};

const hasFocusedFieldInside = (contentElement: HTMLElement | null) => {
  if (typeof document === "undefined" || !contentElement) return false;

  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && isFocusableField(activeElement) && contentElement.contains(activeElement);
};

const clampScrollTop = (element: HTMLElement, nextScrollTop: number) => {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, Math.round(nextScrollTop)));
};

const getTopLimit = () => {
  const contentTopWithGap = readRootCssPx("--app-tg-content-safe-area-inset-top", 0) + TOP_SAFE_GAP;

  return Math.max(
    TOP_SAFE_GAP,
    contentTopWithGap,
    readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP),
  );
};

const getBottomGap = () => Math.max(
  BOTTOM_SAFE_GAP,
  readRootCssPx("--sheet-bottom-gap", BOTTOM_SAFE_GAP),
  readRootCssPx("--app-tg-safe-bottom", 0) + BOTTOM_SAFE_GAP,
  readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0) + BOTTOM_SAFE_GAP,
);

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

  if (layout) {
    root.style.setProperty("--sheet-keyboard-offset", `${normalizePx(layout.bottomOffset)}px`);
    root.style.setProperty("--sheet-max-height", `${normalizePx(layout.maxHeight)}px`);
  }
};

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => (
  Math.abs(first.bottomOffset - second.bottomOffset) <= LAYOUT_CHANGE_THRESHOLD &&
  Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
  first.isKeyboardOpen === second.isKeyboardOpen &&
  first.isViewportChanging === second.isViewportChanging
);

const buildLayout = ({
  isViewportChanging,
  contentElement,
  focusHandoffUntil,
  lastKeyboardOffset,
}: {
  isViewportChanging: boolean;
  contentElement: HTMLElement | null;
  focusHandoffUntil: number;
  lastKeyboardOffset: number;
}): KeyboardAwareSheetLayout => {
  const now = Date.now();
  const metrics = getViewportMetrics();
  const activeFieldInside = hasFocusedFieldInside(contentElement);
  const handoffActive = now < focusHandoffUntil;
  const keyboardInset = metrics.keyboardInset;
  const measuredOpen = keyboardInset > KEYBOARD_OPEN_THRESHOLD;
  const measuredClosingButStillVisible = keyboardInset > KEYBOARD_CLOSE_THRESHOLD;

  /*
    Ключевая часть плавности: при переходе input -> input браузер может на 1-2 кадра
    отдать keyboardInset = 0. Это не закрытие клавиатуры, а handoff. На этот короткий
    промежуток держим прошлый offset и не даём панели упасть вниз.
  */
  const shouldHoldDuringHandoff =
    !measuredOpen &&
    !measuredClosingButStillVisible &&
    handoffActive &&
    lastKeyboardOffset > KEYBOARD_OPEN_THRESHOLD;

  const bottomOffset = shouldHoldDuringHandoff
    ? lastKeyboardOffset
    : measuredOpen || measuredClosingButStillVisible
      ? keyboardInset
      : 0;

  const isKeyboardOpen = bottomOffset > KEYBOARD_CLOSE_THRESHOLD || activeFieldInside || shouldHoldDuringHandoff;
  const topLimit = getTopLimit();
  const bottomGap = getBottomGap();

  /*
    Sheet НЕ поднимается transform'ом. Верхняя граница всегда остаётся на topLimit
    (contentSafeAreaInset.top + gap), а клавиатура только уменьшает доступную высоту снизу.
  */
  const maxHeight = Math.max(
    180,
    Math.floor(metrics.stableHeight - topLimit - bottomGap - bottomOffset),
  );

  return {
    bottomOffset,
    maxHeight,
    isKeyboardOpen,
    isViewportChanging,
  };
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() =>
    buildLayout({
      isViewportChanging: false,
      contentElement: null,
      focusHandoffUntil: 0,
      lastKeyboardOffset: 0,
    }),
  );

  const latestLayoutRef = useRef(layout);
  const rafIdRef = useRef<number | null>(null);
  const settleTimerIdRef = useRef<number | null>(null);
  const handoffTimerIdRef = useRef<number | null>(null);
  const focusHandoffUntilRef = useRef(0);
  const lastKeyboardOffsetRef = useRef(0);

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      focusHandoffUntilRef.current = 0;
      lastKeyboardOffsetRef.current = 0;
      setRootSheetState(false);
      return;
    }

    const applyLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (nextLayout.bottomOffset > KEYBOARD_CLOSE_THRESHOLD) {
        lastKeyboardOffsetRef.current = nextLayout.bottomOffset;
      }

      if (!nextLayout.isKeyboardOpen && nextLayout.bottomOffset <= KEYBOARD_CLOSE_THRESHOLD) {
        lastKeyboardOffsetRef.current = 0;
      }

      if (isSameLayout(latestLayoutRef.current, nextLayout)) {
        setRootSheetState(true, latestLayoutRef.current);
        return;
      }

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);
      setLayout(nextLayout);
    };

    const readLayout = (isViewportChanging: boolean) => buildLayout({
      isViewportChanging,
      contentElement: contentRef.current,
      focusHandoffUntil: focusHandoffUntilRef.current,
      lastKeyboardOffset: lastKeyboardOffsetRef.current,
    });

    const updateLayout = (isViewportChanging: boolean) => {
      if (rafIdRef.current !== null) return;

      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        applyLayout(readLayout(isViewportChanging));
      });
    };

    const scheduleViewportUpdate = () => {
      resetDocumentScroll();
      updateLayout(true);

      if (settleTimerIdRef.current !== null) {
        window.clearTimeout(settleTimerIdRef.current);
      }

      settleTimerIdRef.current = window.setTimeout(() => {
        updateLayout(false);
      }, VIEWPORT_SETTLE_MS);
    };

    resetDocumentScroll();
    applyLayout(readLayout(false));

    const lockGlobalScroll = () => resetDocumentScroll();

    window.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("scroll", lockGlobalScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate);
    window.addEventListener("resize", scheduleViewportUpdate);
    window.addEventListener("orientationchange", scheduleViewportUpdate);
    window.addEventListener("app:telegram-viewport-change", scheduleViewportUpdate);

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      if (settleTimerIdRef.current !== null) {
        window.clearTimeout(settleTimerIdRef.current);
        settleTimerIdRef.current = null;
      }

      window.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("scroll", lockGlobalScroll);
      window.visualViewport?.removeEventListener("resize", scheduleViewportUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleViewportUpdate);
      window.removeEventListener("resize", scheduleViewportUpdate);
      window.removeEventListener("orientationchange", scheduleViewportUpdate);
      window.removeEventListener("app:telegram-viewport-change", scheduleViewportUpdate);
    };
  }, [contentRef, open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimerId: number | null = null;
    let settleFocusTimerId: number | null = null;

    const scheduleHandoffRelease = () => {
      if (handoffTimerIdRef.current !== null) {
        window.clearTimeout(handoffTimerIdRef.current);
      }

      handoffTimerIdRef.current = window.setTimeout(() => {
        handoffTimerIdRef.current = null;
        const nextLayout = buildLayout({
          isViewportChanging: false,
          contentElement,
          focusHandoffUntil: focusHandoffUntilRef.current,
          lastKeyboardOffset: lastKeyboardOffsetRef.current,
        });

        latestLayoutRef.current = nextLayout;
        setRootSheetState(true, nextLayout);
        setLayout(nextLayout);
      }, FOCUS_HANDOFF_MS + 24);
    };

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 16;
      const bottomGap = 52;

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
      if (!isFocusableField(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      focusHandoffUntilRef.current = 0;
      markSheetInputInteraction();
      resetDocumentScroll();

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
      }

      focusTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_DELAY_MS);

      settleFocusTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_AFTER_SETTLE_MS);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      const nextFocusIsInside = nextTarget instanceof HTMLElement && contentElement.contains(nextTarget);

      /*
        Если relatedTarget неизвестен, всё равно даём короткий handoff window:
        на iOS/Telegram при смене типа клавиатуры focusout часто приходит раньше focusin.
      */
      focusHandoffUntilRef.current = Date.now() + FOCUS_HANDOFF_MS;

      if (!nextFocusIsInside) {
        scheduleHandoffRelease();
      }
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

      if (handoffTimerIdRef.current !== null) {
        window.clearTimeout(handoffTimerIdRef.current);
        handoffTimerIdRef.current = null;
      }

      focusHandoffUntilRef.current = 0;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [contentRef, open]);

  return layout;
};
