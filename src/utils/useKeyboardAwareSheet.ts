import { useEffect, useRef, useState, type RefObject } from "react";

const KEYBOARD_MIN_GAP = 80;
const LAYOUT_DIFF = 2;
const SETTLE_MS = 140;

export type KeyboardAwareSheetLayout = {
  /** Смещение sheet вверх, только если fixed-низ реально перекрывается клавиатурой. */
  bottomOffset: number;
  /** Максимальная высота sheet внутри видимой области. */
  maxHeight: number;
  /** Открыта ли клавиатура. */
  isKeyboardOpen: boolean;
  /** true во время нативного resize visualViewport, чтобы не было двойной CSS-анимации. */
  isViewportChanging: boolean;
};

let ignoreSheetBackdropCloseUntil = 0;

export const markSheetInputInteraction = () => {
  ignoreSheetBackdropCloseUntil = Date.now() + 450;
};

export const shouldIgnoreSheetBackdropClose = () => Date.now() < ignoreSheetBackdropCloseUntil;

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.round(value));
};

const readRootPx = (name: string, fallback: number) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const numericValue = Number(rawValue.replace("px", ""));

  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : fallback;
};

const getLayoutHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return window.innerHeight || document.documentElement.clientHeight || 0;
};

const getVisibleBottom = () => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;
  if (!visualViewport) return getLayoutHeight();

  return normalizePx(visualViewport.offsetTop + visualViewport.height);
};

const getKeyboardOffset = () => {
  if (typeof window === "undefined") return 0;

  const visualViewport = window.visualViewport;
  if (!visualViewport) return 0;

  return normalizePx(
    Math.max(0, getLayoutHeight() - visualViewport.height - visualViewport.offsetTop),
  );
};

const getNextLayout = (isViewportChanging: boolean): KeyboardAwareSheetLayout => {
  const keyboardOffset = getKeyboardOffset();
  const isKeyboardOpen = keyboardOffset > KEYBOARD_MIN_GAP;
  const visibleBottom = getVisibleBottom();
  const topLimit = readRootPx("--app-tg-sheet-top-limit", 8);
  const bottomGap = readRootPx("--sheet-bottom-gap", 10);

  return {
    bottomOffset: isKeyboardOpen ? keyboardOffset : 0,
    maxHeight: Math.max(180, normalizePx(visibleBottom - topLimit - bottomGap)),
    isKeyboardOpen,
    isViewportChanging,
  };
};

const isSameLayout = (a: KeyboardAwareSheetLayout, b: KeyboardAwareSheetLayout) => {
  return (
    Math.abs(a.bottomOffset - b.bottomOffset) <= LAYOUT_DIFF &&
    Math.abs(a.maxHeight - b.maxHeight) <= LAYOUT_DIFF &&
    a.isKeyboardOpen === b.isKeyboardOpen &&
    a.isViewportChanging === b.isViewportChanging
  );
};

const isEditableTarget = (target: EventTarget | null): target is HTMLElement => {
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
  const rafRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (!open) {
      const nextLayout = getNextLayout(false);
      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      return;
    }

    const applyLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const schedule = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        applyLayout(getNextLayout(true));
      });

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }

      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        applyLayout(getNextLayout(false));
      }, SETTLE_MS);
    };

    schedule();

    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("app:telegram-viewport-change", schedule);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("app:telegram-viewport-change", schedule);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimer: number | null = null;

    const scrollFocusedFieldInsideSheet = (target: HTMLElement) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 14;
      const bottomGap = 56;

      if (targetRect.top < contentRect.top + topGap) {
        contentElement.scrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.top - contentRect.top - topGap,
        );
        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        contentElement.scrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.bottom - contentRect.bottom + bottomGap,
        );
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableTarget(event.target)) return;
      if (!contentElement.contains(event.target)) return;

      markSheetInputInteraction();

      if (focusTimer !== null) {
        window.clearTimeout(focusTimer);
      }

      focusTimer = window.setTimeout(() => {
        scrollFocusedFieldInsideSheet(event.target as HTMLElement);
      }, 120);
    };

    contentElement.addEventListener("focusin", handleFocusIn);

    return () => {
      if (focusTimer !== null) {
        window.clearTimeout(focusTimer);
      }

      contentElement.removeEventListener("focusin", handleFocusIn);
    };
  }, [contentRef, open]);

  return layout;
};
