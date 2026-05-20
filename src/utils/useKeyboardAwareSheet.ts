import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_DETECTION_GAP = 72;
const LAYOUT_CHANGE_THRESHOLD = 1;

/*
  Логика sheet для Telegram Mini App:
  - экран приложения держим стабильным;
  - sheet двигаем отдельно через CSS-переменные;
  - на касание input заранее поднимаем sheet прогнозным offset;
  - когда Telegram/WebView отдаёт реальный visualViewport, синхронизируемся с ним.
*/
const KEYBOARD_SETTLE_DELAY_MS = 96;
const KEYBOARD_FINAL_SETTLE_DELAY_MS = 280;
const CLOSED_LAYOUT_RESET_DELAY_MS = 380;
const FOCUS_SCROLL_DELAY_MS = 36;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 210;
const KEYBOARD_PREOPEN_MS = 185;
const KEYBOARD_PREOPEN_DISMISS_GUARD_MS = 560;
const KEYBOARD_PREOPEN_RATIO = 0.42;
const LAST_KEYBOARD_INSET_STORAGE_KEY = "skapova:last-keyboard-inset";

export type KeyboardAwareSheetLayout = {
  /** Смещение sheet вверх от нижней границы стабильного viewport. */
  bottomOffset: number;
  /** Максимальная высота sheet внутри реально видимой области. */
  maxHeight: number;
  /** true, если visualViewport уменьшился до размера клавиатуры. */
  isKeyboardOpen: boolean;
  /** true во время нативной анимации visualViewport/клавиатуры. */
  isViewportChanging: boolean;
};

type VisualViewportMetrics = {
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const getLayoutViewportHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  return normalizePx(
    Math.max(
      parseCssPxVariable("--tg-viewport-stable-height"),
      parseCssPxVariable("--app-height"),
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
    ),
  );
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
  const visualHeight = normalizePx(
    visualViewport?.height ?? parseCssPxVariable("--tg-viewport-height") ?? layoutHeight,
  );
  const visualOffsetTop = normalizePx(visualViewport?.offsetTop ?? 0);
  const visualBottom = visualOffsetTop + visualHeight;
  const cssKeyboardOffset = parseCssPxVariable("--tg-keyboard-offset");

  return {
    layoutHeight,
    visualHeight: visualHeight || layoutHeight,
    visualOffsetTop,
    keyboardInset: normalizePx(Math.max(cssKeyboardOffset, layoutHeight - visualBottom)),
  };
};

const getLayoutFromKeyboardInset = (
  layoutHeight: number,
  keyboardInset: number,
  isViewportChanging = false,
): KeyboardAwareSheetLayout => {
  const normalizedInset = normalizePx(keyboardInset);
  const isKeyboardOpen = normalizedInset > KEYBOARD_DETECTION_GAP;
  const visibleHeight = isKeyboardOpen
    ? Math.max(220, layoutHeight - normalizedInset)
    : layoutHeight;

  const maxHeight = Math.max(
    180,
    Math.floor(visibleHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP),
  );

  return {
    bottomOffset: isKeyboardOpen ? normalizedInset : 0,
    maxHeight,
    isKeyboardOpen,
    isViewportChanging,
  };
};

const getStoredKeyboardInset = (layoutHeight: number) => {
  if (typeof window === "undefined") return 0;

  try {
    const rawValue = window.sessionStorage.getItem(LAST_KEYBOARD_INSET_STORAGE_KEY);
    const storedValue = rawValue ? Number(rawValue) : 0;

    if (
      Number.isFinite(storedValue) &&
      storedValue > KEYBOARD_DETECTION_GAP &&
      storedValue < layoutHeight * 0.72
    ) {
      return normalizePx(storedValue);
    }
  } catch {
    // sessionStorage может быть недоступен в приватном WebView.
  }

  return 0;
};

const saveKeyboardInset = (keyboardInset: number, layoutHeight: number) => {
  if (typeof window === "undefined") return;

  const normalizedInset = normalizePx(keyboardInset);

  if (
    normalizedInset <= KEYBOARD_DETECTION_GAP ||
    normalizedInset >= layoutHeight * 0.72
  ) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      LAST_KEYBOARD_INSET_STORAGE_KEY,
      String(normalizedInset),
    );
  } catch {
    // Некритично: без сохранённого значения используем прогноз по высоте экрана.
  }
};

const getPredictedKeyboardLayout = () => {
  const layoutHeight = getLayoutViewportHeight();
  const storedInset = getStoredKeyboardInset(layoutHeight);
  const minInset = clampNumber(layoutHeight * 0.32, 220, 300);
  const maxInset = clampNumber(layoutHeight * 0.58, 320, 430);
  const fallbackInset = clampNumber(layoutHeight * KEYBOARD_PREOPEN_RATIO, minInset, maxInset);
  const predictedInset = clampNumber(storedInset || fallbackInset, minInset, maxInset);

  return getLayoutFromKeyboardInset(layoutHeight, predictedInset, true);
};

const getNextLayout = (isViewportChanging = false): KeyboardAwareSheetLayout => {
  const metrics = getMetrics();
  const viewportDiff = metrics.layoutHeight - metrics.visualHeight - metrics.visualOffsetTop;
  const keyboardInset = normalizePx(Math.max(metrics.keyboardInset, viewportDiff));

  return getLayoutFromKeyboardInset(
    metrics.layoutHeight,
    keyboardInset,
    isViewportChanging,
  );
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

const shouldUseKeyboardPreopen = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.visualViewport) return false;

  const isTouchDevice =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true ||
    document.documentElement.classList.contains("tg-mobile");

  return isTouchDevice && getLayoutViewportHeight() >= 420;
};

const lockDocumentScrollPosition = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  if (document.documentElement.scrollTop !== 0) {
    document.documentElement.scrollTop = 0;
  }

  if (document.body.scrollTop !== 0) {
    document.body.scrollTop = 0;
  }
};

const focusElementWithoutViewportJump = (element: HTMLElement) => {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }

  lockDocumentScrollPosition();
};

const clampScrollTop = (element: HTMLElement, nextScrollTop: number) => {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return Math.min(maxScrollTop, Math.max(0, Math.round(nextScrollTop)));
};

const scrollSheetContentTo = (
  element: HTMLElement,
  nextScrollTop: number,
  behavior: ScrollBehavior = "auto",
) => {
  const top = clampScrollTop(element, nextScrollTop);

  if (Math.abs(top - element.scrollTop) <= 1) return;

  element.scrollTo({
    top,
    behavior,
  });
};

const applySheetCssLayout = (
  layout: KeyboardAwareSheetLayout,
  open: boolean,
  mode: "preopen" | "moving" | "settling" | "idle",
) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const offset = open ? layout.bottomOffset : 0;

  root.style.setProperty("--sheet-keyboard-offset", `${offset}px`);
  root.style.setProperty("--sheet-keyboard-offset-negative", `${-offset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
  root.style.setProperty(
    "--sheet-visible-height",
    `${Math.max(220, getLayoutViewportHeight() - offset)}px`,
  );

  if (mode === "preopen") {
    // Предподъём до того, как WebView начнёт менять visualViewport.
    root.style.setProperty("--sheet-root-transform-duration", `${KEYBOARD_PREOPEN_MS}ms`);
    root.style.setProperty("--sheet-container-maxheight-duration", `${KEYBOARD_PREOPEN_MS}ms`);
    root.style.setProperty("--sheet-root-transform-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
    root.style.setProperty("--sheet-container-maxheight-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
    root.classList.add("sheet-keyboard-preopening");
    root.classList.remove("sheet-viewport-moving");
  }

  if (mode === "moving") {
    // Реальная синхронизация с клавиатурой: без CSS-догонялки.
    root.style.setProperty("--sheet-root-transform-duration", "0ms");
    root.style.setProperty("--sheet-container-maxheight-duration", "0ms");
    root.style.setProperty("--sheet-root-transform-ease", "linear");
    root.style.setProperty("--sheet-container-maxheight-ease", "linear");
    root.classList.add("sheet-viewport-moving");
    root.classList.remove("sheet-keyboard-preopening");
  }

  if (mode === "settling") {
    // После последнего resize даём короткое системное досведение.
    root.style.setProperty("--sheet-root-transform-duration", "150ms");
    root.style.setProperty("--sheet-container-maxheight-duration", "150ms");
    root.style.setProperty("--sheet-root-transform-ease", "cubic-bezier(0.2, 0, 0, 1)");
    root.style.setProperty("--sheet-container-maxheight-ease", "cubic-bezier(0.2, 0, 0, 1)");
    root.classList.remove("sheet-viewport-moving", "sheet-keyboard-preopening");
  }

  if (mode === "idle") {
    root.style.removeProperty("--sheet-root-transform-duration");
    root.style.removeProperty("--sheet-container-maxheight-duration");
    root.style.removeProperty("--sheet-root-transform-ease");
    root.style.removeProperty("--sheet-container-maxheight-ease");
    root.classList.remove("sheet-viewport-moving", "sheet-keyboard-preopening");
  }

  root.classList.toggle("sheet-open", open);
  root.classList.toggle("sheet-keyboard-open", open && layout.isKeyboardOpen);
};

const resetSheetCssLayout = () => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.remove(
    "sheet-open",
    "sheet-keyboard-open",
    "sheet-keyboard-preopening",
    "sheet-viewport-moving",
  );
  root.style.setProperty("--sheet-keyboard-offset", "0px");
  root.style.setProperty("--sheet-keyboard-offset-negative", "0px");
  root.style.removeProperty("--sheet-max-height");
  root.style.removeProperty("--sheet-visible-height");
  root.style.removeProperty("--sheet-root-transform-duration");
  root.style.removeProperty("--sheet-container-maxheight-duration");
  root.style.removeProperty("--sheet-root-transform-ease");
  root.style.removeProperty("--sheet-container-maxheight-ease");
};

const markKeyboardPreopenGesture = () => {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.sheetKeyboardPreopenAt = String(Date.now());
};

export const shouldIgnoreSheetBackdropClose = () => {
  if (typeof document === "undefined") return false;

  const rawValue = document.documentElement.dataset.sheetKeyboardPreopenAt;
  const timestamp = rawValue ? Number(rawValue) : 0;

  return Number.isFinite(timestamp) && Date.now() - timestamp < KEYBOARD_PREOPEN_DISMISS_GUARD_MS;
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
    if (typeof document === "undefined") return;

    if (!open) {
      applySheetCssLayout(latestLayoutRef.current, false, "settling");

      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getNextLayout(false);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
        resetSheetCssLayout();
      }, CLOSED_LAYOUT_RESET_DELAY_MS);

      return () => {
        window.clearTimeout(resetTimerId);
      };
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let idleTimerId: number | null = null;

    const setNextLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;

      latestLayoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    const applyMovingLayout = () => {
      rafId = null;
      lockDocumentScrollPosition();

      const nextLayout = getNextLayout(true);
      latestLayoutRef.current = nextLayout;
      applySheetCssLayout(nextLayout, true, "moving");

      if (nextLayout.isKeyboardOpen) {
        saveKeyboardInset(nextLayout.bottomOffset, getLayoutViewportHeight());
      }

      // State обновляем не на каждый пиксель, а только для boolean-флагов и padding.
      setLayout((prev) => {
        const stateLayout = {
          ...nextLayout,
          bottomOffset: prev.bottomOffset,
          maxHeight: prev.maxHeight,
        };

        return isSameLayout(prev, stateLayout) ? prev : stateLayout;
      });
    };

    const applySettledLayout = (final = false) => {
      lockDocumentScrollPosition();

      const nextLayout = getNextLayout(false);
      latestLayoutRef.current = nextLayout;
      applySheetCssLayout(nextLayout, true, final ? "idle" : "settling");
      setNextLayout(nextLayout);

      if (nextLayout.isKeyboardOpen) {
        saveKeyboardInset(nextLayout.bottomOffset, getLayoutViewportHeight());
      }
    };

    const scheduleChangingLayout = () => {
      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
        idleTimerId = null;
      }

      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyMovingLayout);
      }

      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }

      if (finalSettleTimerId !== null) {
        window.clearTimeout(finalSettleTimerId);
      }

      settleTimerId = window.setTimeout(() => {
        applySettledLayout(false);
      }, KEYBOARD_SETTLE_DELAY_MS);

      finalSettleTimerId = window.setTimeout(() => {
        applySettledLayout(true);
      }, KEYBOARD_FINAL_SETTLE_DELAY_MS);
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

      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
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
    let preopenRafId: number | null = null;
    let lastDirectFocusAt = 0;

    const scrollFocusedFieldIntoView = (target: HTMLElement, behavior: ScrollBehavior) => {
      if (!contentElement.contains(target)) return;

      lockDocumentScrollPosition();

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = latestLayoutRef.current.isKeyboardOpen ? 104 : 62;

      if (targetRect.top < contentRect.top + topGap) {
        scrollSheetContentTo(
          contentElement,
          contentElement.scrollTop + targetRect.top - contentRect.top - topGap,
          behavior,
        );
        return;
      }

      if (targetRect.bottom > contentRect.bottom - bottomGap) {
        scrollSheetContentTo(
          contentElement,
          contentElement.scrollTop + targetRect.bottom - contentRect.bottom + bottomGap,
          behavior,
        );
      }
    };

    const preparePreopenKeyboard = (target: HTMLElement) => {
      if (!shouldUseKeyboardPreopen()) return false;
      if (!contentElement.contains(target)) return false;

      pendingFocusTargetRef.current = target;
      markKeyboardPreopenGesture();

      if (latestLayoutRef.current.isKeyboardOpen) {
        return false;
      }

      const predictedLayout = getPredictedKeyboardLayout();

      /*
        Важно: не двигаем sheet до того, как input получил фокус.
        Если transform сработает прямо на pointerdown/touchstart, элемент уезжает
        из-под пальца и нативный tap может не дать фокус — тогда клавиатура
        открывается только со второго нажатия. Поэтому pre-lift запускаем после
        синхронного focus, на ближайшем animation frame.
      */
      latestLayoutRef.current = predictedLayout;
      applySheetCssLayout(predictedLayout, true, "preopen");

      window.requestAnimationFrame(lockDocumentScrollPosition);

      return true;
    };

    const focusFieldFromUserGesture = (target: HTMLElement) => {
      const now = Date.now();

      if (document.activeElement === target || now - lastDirectFocusAt < 90) {
        return;
      }

      lastDirectFocusAt = now;
      focusElementWithoutViewportJump(target);
    };

    const schedulePreopenAfterFocus = (target: HTMLElement) => {
      if (preopenRafId !== null) {
        window.cancelAnimationFrame(preopenRafId);
      }

      preopenRafId = window.requestAnimationFrame(() => {
        preopenRafId = null;

        if (document.activeElement !== target) {
          return;
        }

        preparePreopenKeyboard(target);
      });
    };

    const prepareFocus = (target: EventTarget | null) => {
      if (!shouldHandleFocusedElement(target)) return null;

      const element = target as HTMLElement;
      if (!contentElement.contains(element)) return null;

      pendingFocusTargetRef.current = element;

      return element;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = prepareFocus(event.target);
      if (!element) return;

      const isTouchPointer = event.pointerType !== "mouse";
      if (!isTouchPointer) return;

      focusFieldFromUserGesture(element);
      schedulePreopenAfterFocus(element);
    };

    const handleTouchStart = (event: TouchEvent) => {
      const element = prepareFocus(event.target);
      if (!element) return;

      focusFieldFromUserGesture(element);
      schedulePreopenAfterFocus(element);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldHandleFocusedElement(event.target)) return;

      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;

      pendingFocusTargetRef.current = target;
      lockDocumentScrollPosition();

      // Backup для клиентов, где touch/pointer не успел сработать до focus.
      if (!latestLayoutRef.current.isKeyboardOpen) {
        preparePreopenKeyboard(target);
      }

      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
      }

      /*
        Не используем native scrollIntoView: он часто прокручивает весь Telegram WebView.
        Во время анимации клавиатуры скроллим auto, после settling — мягко.
      */
      focusTimerId = window.setTimeout(() => {
        if (pendingFocusTargetRef.current) {
          scrollFocusedFieldIntoView(pendingFocusTargetRef.current, "auto");
        }
      }, FOCUS_SCROLL_DELAY_MS);

      settleFocusTimerId = window.setTimeout(() => {
        if (pendingFocusTargetRef.current) {
          scrollFocusedFieldIntoView(pendingFocusTargetRef.current, "smooth");
        }
      }, FOCUS_SCROLL_AFTER_SETTLE_MS);
    };

    const handleFocusOut = () => {
      if (!shouldIgnoreSheetBackdropClose()) {
        pendingFocusTargetRef.current = null;
      }

      window.requestAnimationFrame(lockDocumentScrollPosition);
    };

    const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

    if (supportsPointerEvents) {
      contentElement.addEventListener("pointerdown", handlePointerDown, { capture: true });
    } else {
      contentElement.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    }

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);

    return () => {
      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
      }

      if (preopenRafId !== null) {
        window.cancelAnimationFrame(preopenRafId);
      }

      pendingFocusTargetRef.current = null;

      if (supportsPointerEvents) {
        contentElement.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      } else {
        contentElement.removeEventListener("touchstart", handleTouchStart, { capture: true });
      }

      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [contentRef, open]);

  return layout;
};
