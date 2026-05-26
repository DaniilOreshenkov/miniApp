import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 10;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_OPEN_THRESHOLD = 72;
const KEYBOARD_CLOSE_THRESHOLD = 24;
const LAYOUT_CHANGE_THRESHOLD = 3;
const FIELD_SWITCH_HOLD_MS = 620;
const FIELD_BLUR_GRACE_MS = 180;
const KEYBOARD_DISMISS_MS = 260;
const SETTLE_DELAY_MS = 70;
const SECOND_SETTLE_DELAY_MS = 190;
const FINAL_SETTLE_DELAY_MS = 360;
const ZERO_OFFSET_RELEASE_MS = 130;
const UNDERLAY_RELEASE_MS = 360;
const SCROLL_DELAYS = [50, 150, 320];

export type KeyboardAwareSheetLayout = {
  /** Числовой offset нужен для логики и зависимостей React. */
  bottomOffset: number;
  /** Числовой fallback высоты. */
  maxHeight: number;
  /** CSS bottom: safe-bottom + текущая клавиатура. */
  bottomInsetCss: string;
  /** CSS max-height с жёстким верхним safe-area limit. */
  maxHeightCss: string;
  /** Подложка живёт чуть дольше, чтобы при закрытии клавиатуры не просвечивал контент снизу. */
  underlayOffset: number;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
};

export const markSheetInputInteraction = () => {
  // Совместимость со старыми компонентами: раньше это защищало backdrop от случайного закрытия.
  // В v5 outside-tap работает через pointer-events слоёв, поэтому функция намеренно пустая.
};

/**
 * Вызываем перед ручным blur активного поля. Так hook понимает, что это
 * реальное закрытие клавиатуры, а не переход с одного input на другой.
 */
export const requestSheetKeyboardDismiss = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:sheet-keyboard-dismiss-requested"));
};

/**
 * Вызываем перед переходом focus с одного поля на другое.
 * Это не закрытие клавиатуры: hook коротко держит прежнюю высоту,
 * пока Telegram/WebView переключает text/numeric keyboard.
 */
export const prepareSheetFieldSwitch = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:sheet-field-switch-requested"));
};

const bottomInsetCss =
  "calc(var(--sheet-bottom-gap, max(10px, calc(var(--app-tg-safe-bottom, env(safe-area-inset-bottom, 0px)) + 10px))) + var(--sheet-effective-keyboard-offset, 0px))";

const maxHeightCss =
  "max(180px, calc(var(--tg-viewport-stable-height, var(--app-height, 100dvh)) - var(--app-tg-sheet-top-limit, 10px) - var(--sheet-bottom-gap, 16px) - var(--sheet-effective-keyboard-offset, 0px)))";

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

const getStableViewportHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(
      readRootCssPx("--tg-viewport-stable-height", 0),
      readRootCssPx("--app-height", 0),
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
      window.visualViewport?.height || 0,
    ),
  );
};

const getRawKeyboardOffset = (stableHeight: number) => {
  if (typeof window === "undefined") return 0;

  const cssKeyboardOffset = Math.max(
    readRootCssPx("--tg-keyboard-offset", 0),
    readRootCssPx("--app-keyboard-offset", 0),
  );

  const visualViewport = window.visualViewport;
  if (!visualViewport) return normalizePx(cssKeyboardOffset);

  const visualBottom = visualViewport.offsetTop + visualViewport.height;
  const visualKeyboardOffset = Math.max(0, stableHeight - visualBottom);

  return normalizePx(Math.max(cssKeyboardOffset, visualKeyboardOffset));
};

const isEditableElement = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
};


const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  root.classList.toggle("tg-sheet-viewport-changing", Boolean(isOpen && layout?.isViewportChanging));

  if (!isOpen) {
    root.style.setProperty("--sheet-effective-keyboard-offset", "0px");
    root.style.setProperty("--sheet-keyboard-underlay-offset", "0px");
    root.style.setProperty("--sheet-max-height", "0px");
    return;
  }

  if (layout) {
    root.style.setProperty("--sheet-effective-keyboard-offset", `${normalizePx(layout.bottomOffset)}px`);
    root.style.setProperty("--sheet-keyboard-underlay-offset", `${normalizePx(layout.underlayOffset)}px`);
    root.style.setProperty("--sheet-max-height", `${normalizePx(layout.maxHeight)}px`);
  }
};

const clampScrollTop = (element: HTMLElement, nextScrollTop: number) => {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, Math.round(nextScrollTop)));
};

const makeLayout = (
  bottomOffset: number,
  isKeyboardOpen: boolean,
  isViewportChanging: boolean,
  underlayOffset = bottomOffset,
): KeyboardAwareSheetLayout => {
  const stableHeight = Math.max(1, getStableViewportHeight());
  const topLimit = Math.max(TOP_SAFE_GAP, readRootCssPx("--app-tg-sheet-top-limit", TOP_SAFE_GAP));
  const bottomGap = Math.max(BOTTOM_SAFE_GAP, readRootCssPx("--sheet-bottom-gap", BOTTOM_SAFE_GAP));
  const maxHeight = Math.max(180, Math.floor(stableHeight - topLimit - bottomGap - bottomOffset));

  return {
    bottomOffset: normalizePx(bottomOffset),
    maxHeight,
    bottomInsetCss,
    maxHeightCss,
    underlayOffset: normalizePx(underlayOffset),
    isKeyboardOpen,
    isViewportChanging,
  };
};

const getInitialLayout = () => makeLayout(0, false, false);

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
  return (
    Math.abs(first.bottomOffset - second.bottomOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.maxHeight - second.maxHeight) <= LAYOUT_CHANGE_THRESHOLD &&
    Math.abs(first.underlayOffset - second.underlayOffset) <= LAYOUT_CHANGE_THRESHOLD &&
    first.isKeyboardOpen === second.isKeyboardOpen &&
    first.isViewportChanging === second.isViewportChanging
  );
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(getInitialLayout);
  const latestLayoutRef = useRef(layout);
  const lastNonZeroOffsetRef = useRef(0);
  const zeroOffsetSinceRef = useRef<number | null>(null);
  const underlayHoldUntilRef = useRef(0);
  const underlayOffsetRef = useRef(0);
  const focusInsideRef = useRef(false);
  const fieldSwitchHoldUntilRef = useRef(0);
  const keyboardDismissUntilRef = useRef(0);
  const activeEditableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  const api = useMemo(() => ({
    markFieldSwitch() {
      fieldSwitchHoldUntilRef.current = Date.now() + FIELD_SWITCH_HOLD_MS;
    },
    markDismiss() {
      keyboardDismissUntilRef.current = Date.now() + KEYBOARD_DISMISS_MS;
      fieldSwitchHoldUntilRef.current = 0;
      zeroOffsetSinceRef.current = Date.now();
      focusInsideRef.current = false;
    },
  }), []);

  useEffect(() => {
    if (!open) {
      focusInsideRef.current = false;
      fieldSwitchHoldUntilRef.current = 0;
      keyboardDismissUntilRef.current = 0;
      activeEditableRef.current = null;
      lastNonZeroOffsetRef.current = 0;
      underlayHoldUntilRef.current = 0;
      underlayOffsetRef.current = 0;
      zeroOffsetSinceRef.current = null;
      const nextLayout = getInitialLayout();
      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
      setRootSheetState(false, nextLayout);
      return;
    }

    setRootSheetState(true, latestLayoutRef.current);
    resetDocumentScroll();

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let secondSettleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollLockRafId: number | null = null;

    const computeLayout = (isViewportChanging: boolean): KeyboardAwareSheetLayout => {
      const stableHeight = Math.max(1, getStableViewportHeight());
      const rawOffset = getRawKeyboardOffset(stableHeight);
      const now = Date.now();
      const contentElement = contentRef.current;
      const activeElement = typeof document !== "undefined" ? document.activeElement : null;
      const activeElementIsInsideSheet =
        activeElement instanceof HTMLElement && Boolean(contentElement?.contains(activeElement));
      const dismissInProgress = now < keyboardDismissUntilRef.current;
      const switchInProgress = now < fieldSwitchHoldUntilRef.current;
      const lastOffset = lastNonZeroOffsetRef.current;

      if (rawOffset > KEYBOARD_CLOSE_THRESHOLD) {
        zeroOffsetSinceRef.current = null;
      } else if (zeroOffsetSinceRef.current === null) {
        zeroOffsetSinceRef.current = now;
      }

      const zeroOffsetDuration = zeroOffsetSinceRef.current === null ? 0 : now - zeroOffsetSinceRef.current;
      let effectiveOffset = 0;

      if (rawOffset > KEYBOARD_CLOSE_THRESHOLD) {
        // Telegram/visualViewport иногда отдаёт маленькие скачки во время одной и той же клавиатуры.
        // Микроизменения не должны дергать sheet.
        effectiveOffset =
          lastOffset > KEYBOARD_OPEN_THRESHOLD && Math.abs(rawOffset - lastOffset) <= 8
            ? lastOffset
            : rawOffset;
      } else if (
        !dismissInProgress &&
        switchInProgress &&
        lastOffset > KEYBOARD_OPEN_THRESHOLD
      ) {
        // Между focusout одного поля и focusin другого WebView может на 1-3 кадра вернуть 0.
        // Держим старую высоту только в handoff-окне.
        effectiveOffset = lastOffset;
      } else if (
        !dismissInProgress &&
        activeElementIsInsideSheet &&
        lastOffset > KEYBOARD_OPEN_THRESHOLD &&
        zeroOffsetDuration < ZERO_OFFSET_RELEASE_MS
      ) {
        // Если клавиатура закрывается системно, сначала даём viewport стабилизироваться,
        // но не держим offset долго, чтобы не было зависания.
        effectiveOffset = lastOffset;
      }

      effectiveOffset = normalizePx(effectiveOffset);

      if (effectiveOffset > KEYBOARD_OPEN_THRESHOLD) {
        lastNonZeroOffsetRef.current = effectiveOffset;
      } else if (!switchInProgress || dismissInProgress || zeroOffsetDuration >= ZERO_OFFSET_RELEASE_MS) {
        lastNonZeroOffsetRef.current = 0;
      }

      if (effectiveOffset > KEYBOARD_OPEN_THRESHOLD || rawOffset > KEYBOARD_CLOSE_THRESHOLD) {
        underlayOffsetRef.current = Math.max(effectiveOffset, rawOffset, lastOffset);
        underlayHoldUntilRef.current = now + UNDERLAY_RELEASE_MS;
      } else if (now >= underlayHoldUntilRef.current) {
        underlayOffsetRef.current = 0;
      }

      const underlayOffset = now < underlayHoldUntilRef.current ? underlayOffsetRef.current : 0;
      const isKeyboardOpen = effectiveOffset > KEYBOARD_OPEN_THRESHOLD;
      return makeLayout(effectiveOffset, isKeyboardOpen, isViewportChanging, underlayOffset);
    };

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      // CSS-переменные пишем сразу, чтобы sheet шёл за viewport без React-render на каждый пиксель.
      setRootSheetState(true, nextLayout);

      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const flushChangingLayout = () => {
      rafId = null;
      commitLayout(computeLayout(true));
    };

    const scheduleLayout = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(flushChangingLayout);
      }

      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (secondSettleTimerId !== null) window.clearTimeout(secondSettleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);

      settleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, SETTLE_DELAY_MS);

      secondSettleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, SECOND_SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        commitLayout(computeLayout(false));
      }, FINAL_SETTLE_DELAY_MS);
    };

    const handleKeyboardDismissRequest = () => {
      api.markDismiss();
      scheduleLayout();
    };

    const handleFieldSwitchRequest = () => {
      api.markFieldSwitch();
      scheduleLayout();
    };

    const lockGlobalScroll = () => {
      if (scrollLockRafId !== null) return;

      scrollLockRafId = window.requestAnimationFrame(() => {
        scrollLockRafId = null;
        resetDocumentScroll();
      });
    };

    scheduleLayout();

    window.addEventListener("app:telegram-viewport-change", scheduleLayout);
    window.addEventListener("app:sheet-keyboard-dismiss-requested", handleKeyboardDismissRequest);
    window.addEventListener("app:sheet-field-switch-requested", handleFieldSwitchRequest);
    window.addEventListener("scroll", lockGlobalScroll, { passive: true });
    document.addEventListener("scroll", lockGlobalScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (secondSettleTimerId !== null) window.clearTimeout(secondSettleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      if (scrollLockRafId !== null) window.cancelAnimationFrame(scrollLockRafId);

      window.removeEventListener("app:telegram-viewport-change", scheduleLayout);
      window.removeEventListener("app:sheet-keyboard-dismiss-requested", handleKeyboardDismissRequest);
      window.removeEventListener("app:sheet-field-switch-requested", handleFieldSwitchRequest);
      window.removeEventListener("scroll", lockGlobalScroll);
      document.removeEventListener("scroll", lockGlobalScroll);
      window.visualViewport?.removeEventListener("resize", scheduleLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("orientationchange", scheduleLayout);
    };
  }, [api, contentRef, open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusOutTimerId: number | null = null;
    const scrollTimerIds: number[] = [];

    const scheduleLayoutAfterFocusChange = () => {
      window.dispatchEvent(new CustomEvent("app:telegram-viewport-change"));
    };

    const scrollFocusedFieldIntoView = (target: HTMLElement, behavior: ScrollBehavior = "auto") => {
      if (!contentElement.contains(target)) return;

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = Math.max(72, Math.round(contentElement.clientHeight * 0.18));

      let nextScrollTop: number | null = null;

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

      if (nextScrollTop === null || Math.abs(nextScrollTop - contentElement.scrollTop) <= 1) return;

      contentElement.scrollTo({ top: nextScrollTop, behavior });
    };

    const clearScrollTimers = () => {
      while (scrollTimerIds.length) {
        const timerId = scrollTimerIds.pop();
        if (timerId !== undefined) window.clearTimeout(timerId);
      }
    };

    const scheduleFocusScroll = (target: HTMLElement) => {
      clearScrollTimers();
      SCROLL_DELAYS.forEach((delay, index) => {
        const timerId = window.setTimeout(() => {
          const keyboardIsSettling = latestLayoutRef.current.isViewportChanging;
          scrollFocusedFieldIntoView(
            target,
            index === SCROLL_DELAYS.length - 1 && !keyboardIsSettling ? "smooth" : "auto",
          );
        }, delay);
        scrollTimerIds.push(timerId);
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!contentElement.contains(target as Node)) return;

      markSheetInputInteraction();

      if (isEditableElement(target)) {
        // Этап 1: тап по другому input — это переключение поля, а не закрытие клавиатуры.
        // Ничего не blur'им в pointerdown, иначе WebView успевает уронить sheet до нового focus.
        api.markFieldSwitch();
        return;
      }

      // На этом этапе НЕ закрываем клавиатуру от любого тапа внутри sheet.
      // Иначе тап по соседнему полю/области может восприниматься как dismiss,
      // из-за чего sheet падает вниз до нового focus. Закрытие по пустому месту сделаем отдельным шагом.
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;

      const target = event.target;
      if (!contentElement.contains(target)) return;

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
        focusOutTimerId = null;
      }

      activeEditableRef.current = target;
      focusInsideRef.current = true;
      api.markFieldSwitch();
      markSheetInputInteraction();
      resetDocumentScroll();
      scheduleLayoutAfterFocusChange();
      scheduleFocusScroll(target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const relatedTarget = event.relatedTarget;
      const nextFocusIsInside = relatedTarget instanceof HTMLElement && contentElement.contains(relatedTarget);

      if (nextFocusIsInside) {
        api.markFieldSwitch();
      } else if (Date.now() >= keyboardDismissUntilRef.current) {
        // Короткая пауза на мобильный focus handoff, но без долгого залипания.
        fieldSwitchHoldUntilRef.current = Date.now() + FIELD_BLUR_GRACE_MS;
      }

      if (focusOutTimerId !== null) {
        window.clearTimeout(focusOutTimerId);
      }

      focusOutTimerId = window.setTimeout(() => {
        const activeElement = document.activeElement;
        const stillInside = activeElement instanceof HTMLElement && contentElement.contains(activeElement);
        focusInsideRef.current = stillInside;
        activeEditableRef.current = stillInside ? activeElement : null;
        scheduleLayoutAfterFocusChange();
      }, 60);

      scheduleLayoutAfterFocusChange();
    };

    const handleInput = (event: Event) => {
      if (!isEditableElement(event.target)) return;
      const target = event.target;
      if (!contentElement.contains(target)) return;

      // После ввода текста высота/позиция поля может измениться: докручиваем его снова.
      activeEditableRef.current = target;
      scheduleFocusScroll(target);
    };

    contentElement.addEventListener("pointerdown", handlePointerDown, { passive: true });
    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);
    contentElement.addEventListener("input", handleInput);
    contentElement.addEventListener("change", handleInput);

    return () => {
      clearScrollTimers();
      if (focusOutTimerId !== null) window.clearTimeout(focusOutTimerId);

      focusInsideRef.current = false;
      activeEditableRef.current = null;
      contentElement.removeEventListener("pointerdown", handlePointerDown);
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
      contentElement.removeEventListener("input", handleInput);
      contentElement.removeEventListener("change", handleInput);
    };
  }, [api, contentRef, open]);

  return layout;
};
