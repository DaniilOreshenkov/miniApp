import { useEffect, useRef, useState, type RefObject } from "react";

const MIN_SHEET_HEIGHT = 280;
const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 8;
const KEYBOARD_DETECTION_GAP = 90;
const LAYOUT_CHANGE_THRESHOLD = 6;
const FOCUS_SCROLL_DELAY_MS = 70;
const FOCUS_SCROLL_AFTER_KEYBOARD_MS = 230;
const SETTLE_DELAY_MS = 210;

type KeyboardAwareSheetLayout = {
  /**
   * Sheet остаётся закреплённым снизу. При открытой клавиатуре меняем только
   * доступную высоту окна, чтобы Telegram WebView не дёргал весь интерфейс.
   */
  bottomOffset: number;
  /** Максимальная высота sheet с учётом Telegram viewport, safe-area и клавиатуры. */
  maxHeight: number;
  /** Признак, что visualViewport уменьшился из-за клавиатуры. */
  isKeyboardOpen: boolean;
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getVisualViewportHeight = () => {
  if (typeof window === "undefined") return 0;

  return window.visualViewport?.height ?? getLayoutViewportHeight();
};

const getNextLayout = (): KeyboardAwareSheetLayout => {
  const layoutViewportHeight = getLayoutViewportHeight();
  const visualViewportHeight = getVisualViewportHeight();
  const viewportHeight = layoutViewportHeight || visualViewportHeight || 0;

  /*
    Берём меньшую высоту. На iOS/Telegram при открытии клавиатуры visualViewport
    уменьшается, а layout viewport часто остаётся старым. Если оставить старую
    высоту, sheet визуально упрётся в системную навигацию и клавиатуру.
  */
  const availableViewportHeight = Math.max(
    0,
    Math.min(viewportHeight, visualViewportHeight || viewportHeight),
  );

  const keyboardHeight = Math.max(0, viewportHeight - availableViewportHeight);
  const isKeyboardOpen = keyboardHeight > KEYBOARD_DETECTION_GAP;
  const availableSheetHeight = Math.floor(
    availableViewportHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP,
  );

  return {
    bottomOffset: 0,
    maxHeight: isKeyboardOpen
      ? Math.max(1, availableSheetHeight)
      : Math.max(MIN_SHEET_HEIGHT, availableSheetHeight),
    isKeyboardOpen,
  };
};

const isSameLayout = (
  first: KeyboardAwareSheetLayout,
  second: KeyboardAwareSheetLayout,
) => {
  return (
    Math.abs(first.maxHeight - second.maxHeight) < LAYOUT_CHANGE_THRESHOLD &&
    first.bottomOffset === second.bottomOffset &&
    first.isKeyboardOpen === second.isKeyboardOpen
  );
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => getNextLayout());
  const latestLayoutRef = useRef(layout);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (!open) {
      const nextLayout = getNextLayout();
      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      return;
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;

    const applyLayout = () => {
      rafId = null;
      const nextLayout = getNextLayout();

      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const scheduleLayoutUpdate = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyLayout);
      }

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      if (finalSettleTimerId !== null) {
        window.clearTimeout(finalSettleTimerId);
      }

      /*
        Клавиатура в Telegram WebView открывается ступенчато. Два финальных
        пересчёта дают sheet точную высоту без постоянного дёргания во время
        самой системной анимации.
      */
      settleTimerId = window.setTimeout(applyLayout, SETTLE_DELAY_MS);
      finalSettleTimerId = window.setTimeout(applyLayout, SETTLE_DELAY_MS + 160);
    };

    scheduleLayoutUpdate();

    window.visualViewport?.addEventListener("resize", scheduleLayoutUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleLayoutUpdate);
    window.addEventListener("resize", scheduleLayoutUpdate);
    window.addEventListener("orientationchange", scheduleLayoutUpdate);

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

      window.visualViewport?.removeEventListener("resize", scheduleLayoutUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleLayoutUpdate);
      window.removeEventListener("resize", scheduleLayoutUpdate);
      window.removeEventListener("orientationchange", scheduleLayoutUpdate);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimerId: number | null = null;
    let keyboardTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = 32;

      if (targetRect.top < contentRect.top + topGap) {
        contentElement.scrollTop += targetRect.top - contentRect.top - topGap;
        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        contentElement.scrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!contentElement.contains(target)) return;

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (keyboardTimerId !== null) {
        window.clearTimeout(keyboardTimerId);
      }

      focusTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_DELAY_MS);

      keyboardTimerId = window.setTimeout(() => {
        scrollFocusedFieldIntoView(target);
      }, FOCUS_SCROLL_AFTER_KEYBOARD_MS);
    };

    contentElement.addEventListener("focusin", handleFocusIn);

    return () => {
      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (keyboardTimerId !== null) {
        window.clearTimeout(keyboardTimerId);
      }

      contentElement.removeEventListener("focusin", handleFocusIn);
    };
  }, [contentRef, open]);

  return layout;
};
