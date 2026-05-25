import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const BACKDROP_CLOSE_IGNORE_MS = 450;
const KEYBOARD_OPEN_THRESHOLD = 82;
const KEYBOARD_CLOSE_THRESHOLD = 36;
const KEYBOARD_TRANSIENT_ZERO_THRESHOLD = 8;
const LAYOUT_CHANGE_THRESHOLD = 6;
const SETTLE_DELAY_MS = 180;
const FINAL_SETTLE_DELAY_MS = 420;
const CLOSED_LAYOUT_RESET_DELAY_MS = 280;
const FOCUS_SCROLL_DELAY_MS = 160;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 360;

export type KeyboardAwareSheetLayout = {
  /** Насколько нужно поднять sheet от нижней границы layout viewport. */
  bottomOffset: number;
  /** Максимальная высота sheet внутри реально видимой области. */
  maxHeight: number;
  /** true, когда visualViewport уменьшился достаточно сильно и считаем, что открыта клавиатура. */
  isKeyboardOpen: boolean;
  /** true во время изменения visualViewport. CSS-transition НЕ отключаем: sheet двигается кастовой плавной анимацией. */
  isViewportChanging: boolean;
};

type VisualViewportMetrics = {
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  viewportKeyboardInset: number;
  cssKeyboardInset: number;
  keyboardInset: number;
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.round(value));
};

let ignoreSheetBackdropCloseUntil = 0;

export const markSheetInputInteraction = () => {
  ignoreSheetBackdropCloseUntil = Date.now() + BACKDROP_CLOSE_IGNORE_MS;
};

export const shouldIgnoreSheetBackdropClose = () => Date.now() < ignoreSheetBackdropCloseUntil;

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

  const currentHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const stableTelegramHeight = readRootCssPx("--tg-viewport-stable-height", 0);
  const appHeight = readRootCssPx("--app-height", 0);

  /*
    В Telegram/iOS во время клавиатуры window.innerHeight иногда уменьшается вместе
    с visualViewport.height. Если считать inset от такой уменьшенной высоты,
    keyboardInset становится 0 и клавиатура перекрывает sheet. Поэтому берём
    максимальную стабильную высоту, которую отдаёт telegramViewport.ts.
  */
  return Math.max(currentHeight, stableTelegramHeight, appHeight, 1);
};

const getSheetTopLimit = () => {
  const contentTop = readRootCssPx("--app-tg-content-safe-area-inset-top", 0);
  const sheetExtraGap = readRootCssPx("--app-tg-sheet-extra-gap", 8);

  return Math.max(
    TOP_SAFE_GAP,
    readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP),
    contentTop + sheetExtraGap,
  );
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

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const getMetrics = (): VisualViewportMetrics => {
  const layoutHeight = getLayoutViewportHeight();

  if (typeof window === "undefined") {
    return {
      layoutHeight,
      visualHeight: layoutHeight,
      visualOffsetTop: 0,
      viewportKeyboardInset: 0,
      cssKeyboardInset: 0,
      keyboardInset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? layoutHeight;
  const visualOffsetTop = visualViewport?.offsetTop ?? 0;
  const visualBottom = visualOffsetTop + visualHeight;

  const viewportKeyboardInset = normalizePx(Math.max(0, layoutHeight - visualBottom));

  /*
    Важно: НЕ читаем --sheet-keyboard-offset.
    Эта переменная выставляется самим хуком для CSS и иначе получается петля:
    клавиатура уже закрылась, а hook читает свой старый offset и думает,
    что клавиатура всё ещё открыта — из-за этого sheet зависал.
  */
  const cssKeyboardInset = Math.max(
    readRootCssPx("--tg-keyboard-offset", 0),
    readRootCssPx("--app-keyboard-offset", 0),
  );

  return {
    layoutHeight,
    visualHeight: visualHeight || layoutHeight,
    visualOffsetTop,
    viewportKeyboardInset,
    cssKeyboardInset,
    keyboardInset: normalizePx(Math.max(viewportKeyboardInset, cssKeyboardInset)),
  };
};

const shouldHandleFocusedElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
};

const getNextLayout = (
  isViewportChanging = false,
  previousLayout?: KeyboardAwareSheetLayout,
  isSheetInputFocused = false,
): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const wasKeyboardOpen = previousLayout?.isKeyboardOpen ?? false;
  const keyboardThreshold = wasKeyboardOpen ? KEYBOARD_CLOSE_THRESHOLD : KEYBOARD_OPEN_THRESHOLD;

  const isClosingWithoutFocusedInput = Boolean(
    wasKeyboardOpen &&
      !isSheetInputFocused &&
      metrics.viewportKeyboardInset <= KEYBOARD_CLOSE_THRESHOLD,
  );

  const effectiveKeyboardInset = isClosingWithoutFocusedInput ? 0 : metrics.keyboardInset;
  const isKeyboardPhysicallyOpen = effectiveKeyboardInset > keyboardThreshold;

  /*
    При переключении между полями Telegram иногда отдаёт один промежуточный кадр
    с inset 0, хотя фокус ещё внутри sheet и новая клавиатура уже открывается.
    Держим старую геометрию только на этот короткий changing-кадр.
    Когда фокус ушёл из sheet — не держим, чтобы закрытие не зависало.
  */
  const shouldHoldTransientSwitchFrame = Boolean(
    isViewportChanging &&
      isSheetInputFocused &&
      wasKeyboardOpen &&
      effectiveKeyboardInset <= KEYBOARD_TRANSIENT_ZERO_THRESHOLD &&
      (previousLayout?.bottomOffset ?? 0) > KEYBOARD_OPEN_THRESHOLD,
  );

  const isKeyboardOpen = isKeyboardPhysicallyOpen || shouldHoldTransientSwitchFrame;
  const bottomOffset = shouldHoldTransientSwitchFrame
    ? previousLayout?.bottomOffset ?? 0
    : isKeyboardOpen
      ? effectiveKeyboardInset
      : 0;

  const topLimit = getSheetTopLimit();
  const bottomLimit = Math.max(
    BOTTOM_SAFE_GAP,
    readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0),
    readRootCssPx("--app-tg-safe-bottom", BOTTOM_SAFE_GAP),
  );

  const visibleHeight = Math.max(
    180,
    Math.min(metrics.visualHeight, metrics.layoutHeight - bottomOffset),
  );

  const rawMaxHeight = Math.max(180, Math.floor(visibleHeight - topLimit - bottomLimit));
  const maxHeight = shouldHoldTransientSwitchFrame
    ? previousLayout?.maxHeight ?? rawMaxHeight
    : rawMaxHeight;

  return {
    bottomOffset,
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
  const viewportChangingRef = useRef(false);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);

  const isSheetInputFocused = () => {
    if (typeof document === "undefined") return false;

    const activeElement = document.activeElement;

    return Boolean(
      shouldHandleFocusedElement(activeElement) &&
        activeElement instanceof HTMLElement &&
        contentRef.current?.contains(activeElement),
    );
  };

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      viewportChangingRef.current = false;
      setRootSheetState(false, latestLayoutRef.current);

      /*
        Не сбрасываем размеры в тот же кадр, в котором sheet закрывается.
        Иначе при закрытии с открытой клавиатурой transform/height пересчитываются
        одновременно с нативной анимацией клавиатуры — отсюда видимый рывок.
      */
      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getNextLayout(false, latestLayoutRef.current, false);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
        setRootSheetState(false, nextLayout);
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
      setNextLayout(getNextLayout(true, latestLayoutRef.current, isSheetInputFocused()));
    };

    const scheduleChangingLayout = () => {
      viewportChangingRef.current = true;

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
        viewportChangingRef.current = false;
        setNextLayout(getNextLayout(false, latestLayoutRef.current, isSheetInputFocused()));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        viewportChangingRef.current = false;
        setNextLayout(getNextLayout(false, latestLayoutRef.current, isSheetInputFocused()));
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

    const handleFocusChange = () => {
      markSheetInputInteraction();
      scheduleChangingLayout();
    };

    window.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("focusin", handleFocusChange);
    document.addEventListener("focusout", handleFocusChange);

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

      viewportChangingRef.current = false;
      window.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("focusin", handleFocusChange);
      document.removeEventListener("focusout", handleFocusChange);
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
      resetDocumentScroll();

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
      }

      /*
        Не используем scrollIntoView: в Telegram он может прокручивать весь WebView.
        Скроллим только внутренний контент sheet и только если поле реально закрыто.
      */
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
