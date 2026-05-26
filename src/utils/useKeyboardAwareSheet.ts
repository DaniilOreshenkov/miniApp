import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_OPEN_THRESHOLD = 76;
const LAYOUT_CHANGE_THRESHOLD = 3;
const FIELD_SWITCH_HOLD_MS = 420;
const GUARD_RELEASE_MS = 380;
const SETTLE_DELAY_MS = 120;
const FINAL_SETTLE_DELAY_MS = 360;
const CLOSED_RESET_DELAY_MS = 220;
const FOCUS_SCROLL_FAST_MS = 60;
const FOCUS_SCROLL_SETTLED_MS = 260;

export type KeyboardAwareSheetLayout = {
  /** Верх видимой области WebView. Обычно 0, но iOS visualViewport может отдавать offsetTop. */
  viewportTop: number;
  /** Высота видимой области над клавиатурой. */
  viewportHeight: number;
  /** Верхний лимит sheet: content safe-area + небольшой системный отступ. */
  topInset: number;
  /** Нижний отступ sheet внутри видимой области. */
  bottomInset: number;
  /** Максимальная высота панели внутри frame. */
  maxHeight: number;
  /** Клавиатура сейчас занимает нижнюю часть экрана. */
  isKeyboardOpen: boolean;
  /** visualViewport/Telegram viewport ещё двигается. В этот момент layout не анимируем. */
  isViewportChanging: boolean;
  /** Fixed-подложка под клавиатурой, чтобы при закрытии не просвечивал экран. */
  keyboardGuardOffset: number;
  /** Совместимость со старыми версиями компонентов. В v7 не используется для движения sheet. */
  bottomOffset: number;
};

type ViewportSnapshot = {
  stableHeight: number;
  visibleHeight: number;
  viewportTop: number;
  keyboardOffset: number;
};

let sheetInputHandoffUntil = 0;

export const markSheetInputInteraction = (duration = FIELD_SWITCH_HOLD_MS) => {
  sheetInputHandoffUntil = Date.now() + duration;
};

export const shouldIgnoreSheetBackdropClose = () => Date.now() < sheetInputHandoffUntil;

const normalizePx = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
};

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!rawValue) return fallback;

  const numericValue = Number(rawValue.replace("px", ""));
  if (!Number.isFinite(numericValue)) return fallback;

  return Math.max(0, Math.round(numericValue));
};

const getInnerHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(window.innerHeight || document.documentElement.clientHeight || 0);
};

const getViewportSnapshot = (): ViewportSnapshot => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      stableHeight: 0,
      visibleHeight: 0,
      viewportTop: 0,
      keyboardOffset: 0,
    };
  }

  const visualViewport = window.visualViewport;
  const visualHeight = normalizePx(visualViewport?.height ?? 0);
  const visualOffsetTop = normalizePx(visualViewport?.offsetTop ?? 0);
  const innerHeight = getInnerHeight();
  const cssViewportHeight = readRootCssPx("--tg-viewport-height", 0);
  const cssStableHeight = readRootCssPx("--tg-viewport-stable-height", 0);
  const cssKeyboardOffset = readRootCssPx("--tg-keyboard-offset", 0);

  const stableHeight = Math.max(
    cssStableHeight,
    innerHeight,
    visualHeight,
    cssViewportHeight,
    1,
  );

  const visibleFromVisual = visualHeight > 0
    ? Math.max(1, visualHeight)
    : stableHeight;
  const visibleFromTelegram = cssViewportHeight > 0
    ? Math.max(1, Math.min(cssViewportHeight, stableHeight))
    : stableHeight;

  const keyboardFromVisual = visualHeight > 0
    ? Math.max(0, stableHeight - (visualOffsetTop + visualHeight))
    : 0;
  const keyboardFromTelegramVisible = Math.max(0, stableHeight - visibleFromTelegram);
  const keyboardOffset = normalizePx(Math.max(
    cssKeyboardOffset,
    keyboardFromVisual,
    keyboardFromTelegramVisible,
  ));

  const isKeyboardOpen = keyboardOffset > KEYBOARD_OPEN_THRESHOLD;

  const visibleHeight = isKeyboardOpen
    ? Math.max(
        260,
        Math.min(
          stableHeight,
          visibleFromVisual,
          visibleFromTelegram,
          stableHeight - keyboardOffset,
        ),
      )
    : Math.max(260, Math.min(stableHeight, visibleFromVisual, visibleFromTelegram));

  return {
    stableHeight,
    visibleHeight: normalizePx(visibleHeight),
    viewportTop: visualOffsetTop,
    keyboardOffset,
  };
};

const getInsets = (viewportTop: number) => {
  const contentSafeTop = Math.max(
    readRootCssPx("--app-tg-content-safe-area-inset-top", 0),
    readRootCssPx("--tg-content-safe-area-inset-top", 0),
  );

  const sheetTopLimit = Math.max(
    TOP_SAFE_GAP,
    readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP),
    contentSafeTop + TOP_SAFE_GAP,
  );

  const safeBottom = Math.max(
    readRootCssPx("--app-tg-safe-bottom", 0),
    readRootCssPx("--tg-safe-bottom", 0),
    readRootCssPx("--safe-bottom", 0),
  );

  return {
    topInset: Math.max(TOP_SAFE_GAP, sheetTopLimit - viewportTop),
    bottomInset: Math.max(BOTTOM_SAFE_GAP, safeBottom + BOTTOM_SAFE_GAP),
  };
};

const createLayout = (
  isViewportChanging: boolean,
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const snapshot = getViewportSnapshot();
  const now = Date.now();
  const rawKeyboardOpen = snapshot.keyboardOffset > KEYBOARD_OPEN_THRESHOLD;
  const isHandoff = now < sheetInputHandoffUntil;
  const shouldHoldKeyboard =
    !rawKeyboardOpen &&
    isHandoff &&
    Boolean(previousLayout?.isKeyboardOpen) &&
    (previousLayout?.keyboardGuardOffset ?? 0) > KEYBOARD_OPEN_THRESHOLD;

  const effectiveKeyboardOpen = rawKeyboardOpen || shouldHoldKeyboard;
  const effectiveViewportHeight = shouldHoldKeyboard && previousLayout
    ? previousLayout.viewportHeight
    : snapshot.visibleHeight;
  const { topInset, bottomInset } = getInsets(snapshot.viewportTop);
  const maxHeight = Math.max(170, Math.floor(effectiveViewportHeight - topInset - bottomInset));
  const previousGuardOffset = previousLayout?.keyboardGuardOffset ?? 0;
  const shouldHoldGuardAfterClose =
    !rawKeyboardOpen &&
    previousGuardOffset > 0 &&
    (isViewportChanging || now < sheetInputHandoffUntil + GUARD_RELEASE_MS);

  return {
    viewportTop: snapshot.viewportTop,
    viewportHeight: effectiveViewportHeight,
    topInset,
    bottomInset,
    maxHeight,
    isKeyboardOpen: effectiveKeyboardOpen,
    isViewportChanging,
    keyboardGuardOffset: rawKeyboardOpen
      ? snapshot.keyboardOffset
      : shouldHoldKeyboard || shouldHoldGuardAfterClose
        ? previousGuardOffset
        : 0,
    bottomOffset: 0,
  };
};

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
  return (
    Math.abs(first.viewportTop - second.viewportTop) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.viewportHeight - second.viewportHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.topInset - second.topInset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.bottomInset - second.bottomInset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.keyboardGuardOffset - second.keyboardGuardOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging
  );
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  root.classList.toggle("tg-sheet-viewport-changing", Boolean(isOpen && layout?.isViewportChanging));

  if (!layout) return;

  root.style.setProperty("--sheet-viewport-top", `${normalizePx(layout.viewportTop)}px`);
  root.style.setProperty("--sheet-viewport-height", `${normalizePx(layout.viewportHeight)}px`);
  root.style.setProperty("--sheet-top-inset", `${normalizePx(layout.topInset)}px`);
  root.style.setProperty("--sheet-bottom-inset", `${normalizePx(layout.bottomInset)}px`);
  root.style.setProperty("--sheet-keyboard-offset", "0px");
  root.style.setProperty("--sheet-keyboard-guard-offset", `${normalizePx(layout.keyboardGuardOffset)}px`);
  root.style.setProperty("--sheet-max-height", `${normalizePx(layout.maxHeight)}px`);
};

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isEditableElement = (target: EventTarget | null): target is HTMLElement => {
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
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => createLayout(false));
  const latestLayoutRef = useRef(layout);
  const focusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      setRootSheetState(false, latestLayoutRef.current);

      const resetTimerId = window.setTimeout(() => {
        const nextLayout = createLayout(false, latestLayoutRef.current);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
      }, CLOSED_RESET_DELAY_MS);

      return () => window.clearTimeout(resetTimerId);
    }

    setRootSheetState(true, latestLayoutRef.current);
    resetDocumentScroll();

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollRafId: number | null = null;

    const applyLayout = (isViewportChanging: boolean) => {
      const nextLayout = createLayout(isViewportChanging, latestLayoutRef.current);
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setRootSheetState(true, nextLayout);
      setLayout(nextLayout);
    };

    const scheduleChangingLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          applyLayout(true);
        });
      }

      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);

      settleTimerId = window.setTimeout(() => applyLayout(false), SETTLE_DELAY_MS);
      finalSettleTimerId = window.setTimeout(() => applyLayout(false), FINAL_SETTLE_DELAY_MS);
    };

    const lockScroll = () => {
      if (scrollRafId !== null) return;

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        resetDocumentScroll();
      });
    };

    scheduleChangingLayout();

    window.addEventListener("scroll", lockScroll, { passive: true });
    document.addEventListener("scroll", lockScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleChangingLayout);
    window.visualViewport?.addEventListener("scroll", scheduleChangingLayout);
    window.addEventListener("resize", scheduleChangingLayout);
    window.addEventListener("orientationchange", scheduleChangingLayout);
    window.addEventListener("app:telegram-viewport-change", scheduleChangingLayout);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);

      window.removeEventListener("scroll", lockScroll);
      document.removeEventListener("scroll", lockScroll);
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
    let focusSettleTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement, smooth: boolean) => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 16;
      const bottomGap = 76;
      let nextScrollTop = contentElement.scrollTop;

      if (targetRect.top < contentRect.top + topGap) {
        nextScrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.top - contentRect.top - topGap,
        );
      } else if (targetRect.bottom > contentRect.bottom - bottomGap) {
        nextScrollTop = clampScrollTop(
          contentElement,
          contentElement.scrollTop + targetRect.bottom - contentRect.bottom + bottomGap,
        );
      }

      if (Math.abs(nextScrollTop - contentElement.scrollTop) <= 1) return;

      contentElement.scrollTo({
        top: nextScrollTop,
        behavior: smooth && !latestLayoutRef.current.isViewportChanging ? "smooth" : "auto",
      });
    };

    const scheduleFocusedFieldScroll = (target: HTMLElement) => {
      if (focusTimerId !== null) window.clearTimeout(focusTimerId);
      if (focusSettleTimerId !== null) window.clearTimeout(focusSettleTimerId);

      focusTimerId = window.setTimeout(() => scrollFocusedFieldIntoView(target, false), FOCUS_SCROLL_FAST_MS);
      focusSettleTimerId = window.setTimeout(
        () => scrollFocusedFieldIntoView(target, true),
        FOCUS_SCROLL_SETTLED_MS,
      );
    };

    const handlePointerDownCapture = (event: PointerEvent) => {
      const target = event.target;
      if (!isEditableElement(target)) return;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== target &&
        contentElement.contains(activeElement) &&
        isEditableElement(activeElement)
      ) {
        markSheetInputInteraction();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;
      if (!contentElement.contains(event.target)) return;

      focusedElementRef.current = event.target;
      markSheetInputInteraction();
      resetDocumentScroll();
      scheduleFocusedFieldScroll(event.target);
    };

    const handleFocusOut = () => {
      focusedElementRef.current = null;
      markSheetInputInteraction(220);
    };

    const handleInput = () => {
      const target = focusedElementRef.current;
      if (!target) return;

      scheduleFocusedFieldScroll(target);
    };

    contentElement.addEventListener("pointerdown", handlePointerDownCapture, true);
    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);
    contentElement.addEventListener("input", handleInput);

    return () => {
      if (focusTimerId !== null) window.clearTimeout(focusTimerId);
      if (focusSettleTimerId !== null) window.clearTimeout(focusSettleTimerId);

      focusedElementRef.current = null;
      contentElement.removeEventListener("pointerdown", handlePointerDownCapture, true);
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
      contentElement.removeEventListener("input", handleInput);
    };
  }, [contentRef, open]);

  return layout;
};
