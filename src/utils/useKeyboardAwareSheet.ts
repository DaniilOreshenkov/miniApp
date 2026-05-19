import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_DETECTION_GAP = 72;
const LAYOUT_CHANGE_THRESHOLD = 2;
const SETTLE_DELAY_MS = 120;
const FINAL_SETTLE_DELAY_MS = 360;
const CLOSED_LAYOUT_RESET_DELAY_MS = 420;
const FOCUS_SCROLL_DELAY_MS = 80;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 300;

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

const parseCssPxVariable = (name: string) => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!value.endsWith("px")) return 0;

  const numericValue = Number(value.replace("px", ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  /*
    Берём самую стабильную высоту, а не только window.innerHeight.
    На Android/Telegram innerHeight может уменьшаться при клавиатуре — если опереться
    только на него, весь app-shell начинает прыгать вместе с клавиатурой.
  */
  return Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    parseCssPxVariable("--tg-viewport-stable-height"),
    parseCssPxVariable("--app-height"),
  );
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.round(value));
};

const lockDocumentScrollPosition = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }

  if (document.documentElement.scrollTop !== 0) {
    document.documentElement.scrollTop = 0;
  }

  if (document.body.scrollTop !== 0) {
    document.body.scrollTop = 0;
  }
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
  const rawKeyboardInset = layoutHeight - visualBottom;

  return {
    layoutHeight,
    visualHeight: visualHeight || layoutHeight,
    visualOffsetTop,
    keyboardInset: normalizePx(rawKeyboardInset),
  };
};

const getNextLayout = (isViewportChanging = false): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const viewportDiff = metrics.layoutHeight - metrics.visualHeight - metrics.visualOffsetTop;
  const isKeyboardOpen =
    metrics.keyboardInset > KEYBOARD_DETECTION_GAP || viewportDiff > KEYBOARD_DETECTION_GAP;

  /*
    Максимальная высота берётся из visualViewport — это реально видимая область.
    offsetTop не вычитаем второй раз: на iOS он может кратковременно меняться и давать рывок.
  */
  const maxHeight = Math.max(
    180,
    Math.floor(metrics.visualHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP),
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

const scrollSheetContentTo = (element: HTMLElement, nextScrollTop: number) => {
  const top = clampScrollTop(element, nextScrollTop);

  if (Math.abs(top - element.scrollTop) <= 1) return;

  element.scrollTo({
    top,
    behavior: "auto",
  });
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
  }, [layout]);

  useEffect(() => {
    if (!open) {
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
      lockDocumentScrollPosition();
      setNextLayout(getNextLayout(true));
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

      /*
        Пока Telegram/iOS анимирует visualViewport, CSS-transition у sheet отключён:
        панель следует за клавиатурой кадр-в-кадр. После завершения событий включаем
        стабильное состояние без «догоняющего» скачка.
      */
      settleTimerId = window.setTimeout(() => {
        lockDocumentScrollPosition();
        setNextLayout(getNextLayout(false));
      }, SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        lockDocumentScrollPosition();
        setNextLayout(getNextLayout(false));
      }, FINAL_SETTLE_DELAY_MS);
    };

    const handleWindowScroll = () => {
      lockDocumentScrollPosition();
    };

    scheduleChangingLayout();

    window.visualViewport?.addEventListener("resize", scheduleChangingLayout);
    window.visualViewport?.addEventListener("scroll", scheduleChangingLayout);
    window.addEventListener("resize", scheduleChangingLayout);
    window.addEventListener("orientationchange", scheduleChangingLayout);
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

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

      window.visualViewport?.removeEventListener("resize", scheduleChangingLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleChangingLayout);
      window.removeEventListener("resize", scheduleChangingLayout);
      window.removeEventListener("orientationchange", scheduleChangingLayout);
      window.removeEventListener("scroll", handleWindowScroll);
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

      lockDocumentScrollPosition();

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 16;
      const bottomGap = latestLayoutRef.current.isKeyboardOpen ? 86 : 58;

      if (targetRect.top < contentRect.top + topGap) {
        scrollSheetContentTo(
          contentElement,
          contentElement.scrollTop + targetRect.top - contentRect.top - topGap,
        );

        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        scrollSheetContentTo(
          contentElement,
          contentElement.scrollTop + targetRect.bottom - contentRect.bottom + bottomGap,
        );
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldHandleFocusedElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      pendingFocusTargetRef.current = target;
      lockDocumentScrollPosition();

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
      window.requestAnimationFrame(lockDocumentScrollPosition);
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
