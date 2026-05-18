import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_DETECTION_GAP = 90;
const LAYOUT_CHANGE_THRESHOLD = 2;
const SETTLE_DELAY_MS = 130;
const FINAL_SETTLE_DELAY_MS = 320;
const FOCUS_SCROLL_DELAY_MS = 40;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 260;

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
    keyboardInset: Math.max(0, Math.ceil(layoutHeight - visualBottom)),
  };
};

const getNextLayout = (isViewportChanging = false): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const isKeyboardOpen = metrics.keyboardInset > KEYBOARD_DETECTION_GAP;

  /*
    Высоту считаем от visualViewport, а не от window.innerHeight. Это ключевой момент:
    sheet не может вырасти за видимую область Telegram WebView и не залезает под клавиатуру.
  */
  const maxHeight = Math.max(
    180,
    Math.floor(metrics.visualHeight - metrics.visualOffsetTop - TOP_SAFE_GAP - BOTTOM_SAFE_GAP),
  );

  return {
    bottomOffset: metrics.keyboardInset,
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
      const nextLayout = getNextLayout(false);
      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      return;
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
      const bottomGap = 52;

      if (targetRect.top < contentRect.top + topGap) {
        contentElement.scrollTop += targetRect.top - contentRect.top - topGap;
        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        contentElement.scrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldHandleFocusedElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      pendingFocusTargetRef.current = target;

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
