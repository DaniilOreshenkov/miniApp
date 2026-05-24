import { useEffect, useRef, useState, type RefObject } from "react";

const BOTTOM_SAFE_GAP = 10;
const BACKDROP_CLOSE_IGNORE_MS = 450;
const KEYBOARD_DETECTION_GAP = 90;
const LAYOUT_CHANGE_THRESHOLD = 3;
const SETTLE_DELAY_MS = 130;
const FINAL_SETTLE_DELAY_MS = 340;
const CLOSED_LAYOUT_RESET_DELAY_MS = 360;
const FOCUS_SCROLL_DELAY_MS = 80;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 320;

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
  /** true только во время системной анимации visualViewport. В этот момент CSS-transition отключаем. */
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

const getNextLayout = (isViewportChanging = false): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const isKeyboardOpen = metrics.keyboardInset > KEYBOARD_DETECTION_GAP;

  /*
    Высоту считаем от visualViewport. Важно: не привязываем sheet к window.innerHeight,
    потому что Telegram/iOS во время клавиатуры могут держать старую высоту layout viewport.
  */
  const topLimit = readRootCssPx("--app-tg-sheet-top-limit", readRootCssPx("--app-tg-safe-top", 0));
  const bottomLimit = Math.max(BOTTOM_SAFE_GAP, readRootCssPx("--app-tg-safe-bottom", BOTTOM_SAFE_GAP));

  const maxHeight = Math.max(
    180,
    Math.floor(metrics.visualHeight - metrics.visualOffsetTop - topLimit - bottomLimit),
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
  }, [layout]);

  useEffect(() => {
    if (!open) {
      viewportChangingRef.current = false;

      /*
        Не сбрасываем размеры в тот же кадр, в котором sheet закрывается.
        Иначе при закрытии с открытой клавиатурой transform/height пересчитываются
        одновременно с нативной анимацией клавиатуры — отсюда видимый рывок.
      */
      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getNextLayout(false);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
      }, CLOSED_LAYOUT_RESET_DELAY_MS);

      return () => {
        window.clearTimeout(resetTimerId);
      };
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;

    const setNextLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const applyChangingLayout = () => {
      rafId = null;
      setNextLayout(getNextLayout(true));
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
        Во время системной анимации клавиатуры CSS-transition отключается, а sheet
        следует за visualViewport кадр-в-кадр. Когда события закончились, включаем
        финальное стабильное состояние. Это убирает «догоняющую» дёрганую анимацию.
      */
      settleTimerId = window.setTimeout(() => {
        viewportChangingRef.current = false;
        setNextLayout(getNextLayout(false));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        viewportChangingRef.current = false;
        setNextLayout(getNextLayout(false));
      }, FINAL_SETTLE_DELAY_MS);
    };

    scheduleChangingLayout();

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

      viewportChangingRef.current = false;
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
 