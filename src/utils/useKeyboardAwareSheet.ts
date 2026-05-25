import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const BACKDROP_CLOSE_IGNORE_MS = 450;
const KEYBOARD_OPEN_THRESHOLD = 82;
const KEYBOARD_CLOSE_THRESHOLD = 36;
const LAYOUT_CHANGE_THRESHOLD = 10;
const SETTLE_DELAY_MS = 260;
const FINAL_SETTLE_DELAY_MS = 560;
const CLOSED_LAYOUT_RESET_DELAY_MS = 360;
const FOCUS_SCROLL_DELAY_MS = 180;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 430;

export type KeyboardAwareSheetLayout = {
  /**
   * Насколько нужно поднять sheet от нижней границы layout viewport.
   * Во время открытия клавиатуры Telegram/iOS может оставлять fixed-элементы
   * привязанными к старой высоте экрана, поэтому считаем смещение вручную.
   */
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
  keyboardInset: number;
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return window.innerHeight || document.documentElement.clientHeight || 0;
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
      keyboardInset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? layoutHeight;
  const visualOffsetTop = visualViewport?.offsetTop ?? 0;
  const visualBottom = visualOffsetTop + visualHeight;

  return {
    layoutHeight,
    visualHeight: visualHeight || layoutHeight,
    visualOffsetTop,
    keyboardInset: normalizePx(layoutHeight - visualBottom),
  };
};

const getNextLayout = (
  isViewportChanging = false,
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const wasKeyboardOpen = previousLayout?.isKeyboardOpen ?? false;
  const keyboardThreshold = wasKeyboardOpen ? KEYBOARD_CLOSE_THRESHOLD : KEYBOARD_OPEN_THRESHOLD;
  const isKeyboardOpen = metrics.keyboardInset > keyboardThreshold;

  /*
    Высоту считаем от visualViewport. Важно: не привязываем sheet к window.innerHeight,
    потому что Telegram/iOS во время клавиатуры могут держать старую высоту layout viewport.
  */
  const topLimit = Math.max(TOP_SAFE_GAP, readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP));
  const bottomLimit = Math.max(
    BOTTOM_SAFE_GAP,
    readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0),
    readRootCssPx("--app-tg-safe-bottom", BOTTOM_SAFE_GAP),
  );

  /*
    Важно: visualViewport.height уже является видимой высотой.
    Не вычитаем visualViewport.offsetTop второй раз — из-за этого на iOS/Telegram
    sheet мог резко сжиматься и дёргаться при появлении клавиатуры.
  */
  const maxHeight = Math.max(
    180,
    Math.floor(metrics.visualHeight - topLimit - bottomLimit),
  );

  return {
    bottomOffset: isKeyboardOpen ? metrics.keyboardInset : 0,
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
  const viewportChangingRef = useRef(false);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);

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

      /*
        Во время системной анимации клавиатуры мы не дёргаем layout фона и не
        отключаем transition у sheet. Только обновляем целевую позицию, а сама
        панель плавно доезжает кастовой анимацией, как alert/system sheet.
      */
      settleTimerId = window.setTimeout(() => {
        viewportChangingRef.current = false;
        setNextLayout(getNextLayout(false, latestLayoutRef.current));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        viewportChangingRef.current = false;
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
      window.visualViewport?.removeEventListener("resize", scheduleChangingLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleChangingLayout);
      window.removeEventListener("resize", scheduleChangingLayout);
      window.removeEventListener("orientationchange", scheduleChangingLayout);
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
