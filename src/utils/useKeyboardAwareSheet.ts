import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_SAFE_GAP = 12;
const BOTTOM_SAFE_GAP = 10;
const KEYBOARD_DETECTION_GAP = 72;
const LAYOUT_CHANGE_THRESHOLD = 1;

const KEYBOARD_PREOPEN_MS = 175;
const KEYBOARD_PREOPEN_RATIO = 0.38;
const KEYBOARD_SWITCH_SMOOTH_MS = 165;
const KEYBOARD_CLOSE_SMOOTH_MS = 230;
const KEYBOARD_IDLE_DELAY_MS = 120;
const KEYBOARD_SWITCH_GUARD_MS = 520;
const KEYBOARD_BACKDROP_GUARD_MS = 560;
const KEYBOARD_CLOSE_GRACE_MS = 170;
const KEYBOARD_SWITCH_MAX_DELTA = 190;
const SAME_KEYBOARD_FIELD_SWITCH_FREEZE_MS = 420;
const FOCUS_SCROLL_DELAY_MS = 72;
const FOCUS_SCROLL_AFTER_SETTLE_MS = 260;
const CLOSED_LAYOUT_RESET_DELAY_MS = 340;
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

type SheetMotionMode = "preopen" | "moving" | "switching" | "closing" | "idle";

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
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

  return {
    bottomOffset: isKeyboardOpen ? normalizedInset : 0,
    maxHeight: Math.max(180, Math.floor(visibleHeight - TOP_SAFE_GAP - BOTTOM_SAFE_GAP)),
    isKeyboardOpen,
    isViewportChanging,
  };
};

const getNextLayout = (isViewportChanging = false) => {
  const metrics = getMetrics();
  const viewportDiff = metrics.layoutHeight - metrics.visualHeight - metrics.visualOffsetTop;
  const keyboardInset = normalizePx(Math.max(metrics.keyboardInset, viewportDiff));

  return getLayoutFromKeyboardInset(metrics.layoutHeight, keyboardInset, isViewportChanging);
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
    // sessionStorage может быть недоступен в Telegram WebView.
  }

  return 0;
};

const saveKeyboardInset = (keyboardInset: number, layoutHeight: number) => {
  if (typeof window === "undefined") return;

  const normalizedInset = normalizePx(keyboardInset);

  if (normalizedInset <= KEYBOARD_DETECTION_GAP || normalizedInset >= layoutHeight * 0.72) {
    return;
  }

  try {
    window.sessionStorage.setItem(LAST_KEYBOARD_INSET_STORAGE_KEY, String(normalizedInset));
  } catch {
    // Некритично: без сохранения просто используем прогноз.
  }
};

const getPredictedKeyboardLayout = () => {
  const layoutHeight = getLayoutViewportHeight();
  const storedInset = getStoredKeyboardInset(layoutHeight);
  const minInset = clampNumber(layoutHeight * 0.28, 190, 280);
  const maxInset = clampNumber(layoutHeight * 0.54, 300, 430);
  const fallbackInset = clampNumber(layoutHeight * KEYBOARD_PREOPEN_RATIO, minInset, maxInset);
  const predictedInset = clampNumber(storedInset || fallbackInset, minInset, maxInset);

  return getLayoutFromKeyboardInset(layoutHeight, predictedInset, true);
};

const isSameLayout = (first: KeyboardAwareSheetLayout, second: KeyboardAwareSheetLayout) => {
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

const getKeyboardInputProfile = (target: HTMLElement | null) => {
  if (!target) return "unknown";

  const tagName = target.tagName.toLowerCase();
  if (target.isContentEditable) return "text";
  if (tagName === "textarea") return "text";

  if (target instanceof HTMLInputElement) {
    const inputMode = target.inputMode?.toLowerCase();
    const type = target.type?.toLowerCase();

    if (
      inputMode === "numeric" ||
      inputMode === "decimal" ||
      inputMode === "tel" ||
      type === "number" ||
      type === "tel"
    ) {
      return "numeric";
    }

    if (type === "email") return "email";
    if (type === "url") return "url";
    if (type === "search") return "search";
  }

  return "text";
};

const isSameKeyboardInputProfile = (first: HTMLElement | null, second: HTMLElement | null) => {
  if (!first || !second || first === second) return false;
  return getKeyboardInputProfile(first) === getKeyboardInputProfile(second);
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

  element.scrollTo({ top, behavior });
};

const setSheetMotionVariables = (mode: SheetMotionMode) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  if (mode === "preopen") {
    root.style.setProperty("--sheet-root-transform-duration", `${KEYBOARD_PREOPEN_MS}ms`);
    root.style.setProperty("--sheet-container-maxheight-duration", `${KEYBOARD_PREOPEN_MS}ms`);
    root.style.setProperty("--sheet-root-transform-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
    root.style.setProperty("--sheet-container-maxheight-ease", "cubic-bezier(0.16, 1, 0.3, 1)");
    root.classList.add("sheet-keyboard-preopening");
    root.classList.remove("sheet-viewport-moving", "sheet-keyboard-switching", "sheet-keyboard-closing");
    return;
  }

  if (mode === "moving") {
    root.style.setProperty("--sheet-root-transform-duration", "0ms");
    root.style.setProperty("--sheet-container-maxheight-duration", "0ms");
    root.style.setProperty("--sheet-root-transform-ease", "linear");
    root.style.setProperty("--sheet-container-maxheight-ease", "linear");
    root.classList.add("sheet-viewport-moving");
    root.classList.remove("sheet-keyboard-preopening", "sheet-keyboard-switching", "sheet-keyboard-closing");
    return;
  }

  if (mode === "switching") {
    root.style.setProperty("--sheet-root-transform-duration", `${KEYBOARD_SWITCH_SMOOTH_MS}ms`);
    root.style.setProperty("--sheet-container-maxheight-duration", `${KEYBOARD_SWITCH_SMOOTH_MS}ms`);
    root.style.setProperty("--sheet-root-transform-ease", "cubic-bezier(0.2, 0, 0, 1)");
    root.style.setProperty("--sheet-container-maxheight-ease", "cubic-bezier(0.2, 0, 0, 1)");
    root.classList.add("sheet-keyboard-switching");
    root.classList.remove("sheet-viewport-moving", "sheet-keyboard-preopening", "sheet-keyboard-closing");
    return;
  }

  if (mode === "closing") {
    root.style.setProperty("--sheet-root-transform-duration", `${KEYBOARD_CLOSE_SMOOTH_MS}ms`);
    root.style.setProperty("--sheet-container-maxheight-duration", `${KEYBOARD_CLOSE_SMOOTH_MS}ms`);
    root.style.setProperty("--sheet-root-transform-ease", "cubic-bezier(0.2, 0, 0, 1)");
    root.style.setProperty("--sheet-container-maxheight-ease", "cubic-bezier(0.2, 0, 0, 1)");
    root.classList.add("sheet-keyboard-closing");
    root.classList.remove("sheet-viewport-moving", "sheet-keyboard-preopening", "sheet-keyboard-switching");
    return;
  }

  root.style.removeProperty("--sheet-root-transform-duration");
  root.style.removeProperty("--sheet-container-maxheight-duration");
  root.style.removeProperty("--sheet-root-transform-ease");
  root.style.removeProperty("--sheet-container-maxheight-ease");
  root.classList.remove(
    "sheet-viewport-moving",
    "sheet-keyboard-preopening",
    "sheet-keyboard-switching",
    "sheet-keyboard-closing",
  );
};

const applySheetCssLayout = (
  layout: KeyboardAwareSheetLayout,
  open: boolean,
  mode: SheetMotionMode,
) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const offset = open ? layout.bottomOffset : 0;

  /*
    Важно: сначала выставляем длительность/кривую, потом меняем CSS-переменные.
    Иначе WebView может применить новый offset мгновенно, а transition включить уже после.
  */
  setSheetMotionVariables(mode);

  root.style.setProperty("--sheet-keyboard-offset", `${offset}px`);
  root.style.setProperty("--sheet-keyboard-offset-negative", `${-offset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
  root.style.setProperty(
    "--sheet-visible-height",
    `${Math.max(220, getLayoutViewportHeight() - offset)}px`,
  );

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
    "sheet-keyboard-switching",
    "sheet-keyboard-closing",
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

const markKeyboardGesture = () => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.sheetKeyboardPreopenAt = String(Date.now());
};

export const shouldIgnoreSheetBackdropClose = () => {
  if (typeof document === "undefined") return false;

  const rawValue = document.documentElement.dataset.sheetKeyboardPreopenAt;
  const timestamp = rawValue ? Number(rawValue) : 0;

  return Number.isFinite(timestamp) && Date.now() - timestamp < KEYBOARD_BACKDROP_GUARD_MS;
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => getNextLayout(false));
  const latestLayoutRef = useRef(layout);
  const activeInputRef = useRef<HTMLElement | null>(null);
  const pendingFocusTargetRef = useRef<HTMLElement | null>(null);
  const lastFocusedInputRef = useRef<HTMLElement | null>(null);
  const focusSwitchGuardUntilRef = useRef(0);
  const sameKeyboardFreezeUntilRef = useRef(0);
  const sameKeyboardFreezeLayoutRef = useRef<KeyboardAwareSheetLayout | null>(null);
  const keyboardClosingRef = useRef(false);
  const interactionVersionRef = useRef(0);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (!open) {
      interactionVersionRef.current += 1;
      activeInputRef.current = null;
      pendingFocusTargetRef.current = null;
      lastFocusedInputRef.current = null;
      sameKeyboardFreezeUntilRef.current = 0;
      sameKeyboardFreezeLayoutRef.current = null;
      keyboardClosingRef.current = false;

      const closingLayout = {
        ...latestLayoutRef.current,
        bottomOffset: 0,
        isViewportChanging: true,
      };

      latestLayoutRef.current = closingLayout;
      applySheetCssLayout(closingLayout, false, "closing");

      const resetTimerId = window.setTimeout(() => {
        const nextLayout = getLayoutFromKeyboardInset(getLayoutViewportHeight(), 0, false);
        latestLayoutRef.current = nextLayout;
        setLayout(nextLayout);
        resetSheetCssLayout();
      }, CLOSED_LAYOUT_RESET_DELAY_MS);

      return () => window.clearTimeout(resetTimerId);
    }

    let rafId: number | null = null;
    let idleTimerId: number | null = null;
    let closeFinishTimerId: number | null = null;

    const clearIdleTimer = () => {
      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
        idleTimerId = null;
      }
    };

    const clearCloseFinishTimer = () => {
      if (closeFinishTimerId !== null) {
        window.clearTimeout(closeFinishTimerId);
        closeFinishTimerId = null;
      }
    };

    const commitLayout = (nextLayout: KeyboardAwareSheetLayout, mode: SheetMotionMode) => {
      latestLayoutRef.current = nextLayout;
      applySheetCssLayout(nextLayout, true, mode);

      setLayout((previousLayout) => {
        if (isSameLayout(previousLayout, nextLayout)) return previousLayout;
        return nextLayout;
      });
    };

    const commitIdleWithoutMoving = () => {
      const stableLayout = {
        ...latestLayoutRef.current,
        isViewportChanging: false,
      };

      latestLayoutRef.current = stableLayout;
      applySheetCssLayout(stableLayout, true, "idle");

      setLayout((previousLayout) => {
        if (isSameLayout(previousLayout, stableLayout)) return previousLayout;
        return stableLayout;
      });
    };

    const scheduleIdle = () => {
      clearIdleTimer();
      const scheduledVersion = interactionVersionRef.current;

      idleTimerId = window.setTimeout(() => {
        idleTimerId = null;
        if (scheduledVersion !== interactionVersionRef.current) return;
        commitIdleWithoutMoving();
      }, KEYBOARD_IDLE_DELAY_MS);
    };

    const finishKeyboardClose = () => {
      keyboardClosingRef.current = false;
      sameKeyboardFreezeUntilRef.current = 0;
      sameKeyboardFreezeLayoutRef.current = null;

      const closedLayout = getLayoutFromKeyboardInset(getLayoutViewportHeight(), 0, false);
      const stableClosedLayout: KeyboardAwareSheetLayout = {
        ...closedLayout,
        isViewportChanging: false,
      };

      latestLayoutRef.current = stableClosedLayout;
      applySheetCssLayout(stableClosedLayout, true, "idle");
      setLayout((previousLayout) =>
        isSameLayout(previousLayout, stableClosedLayout) ? previousLayout : stableClosedLayout,
      );
    };

    const beginKeyboardClose = () => {
      clearIdleTimer();
      clearCloseFinishTimer();
      keyboardClosingRef.current = true;
      activeInputRef.current = null;
      lastFocusedInputRef.current = null;
      sameKeyboardFreezeUntilRef.current = 0;
      sameKeyboardFreezeLayoutRef.current = null;

      /*
        Закрытие должно иметь одну конечную точку с самого начала анимации.
        Раньше sheet сначала ехал вниз со старой maxHeight клавиатуры, а потом,
        уже после окончания движения, пересобирался в стандартную высоту — из-за
        этого появлялся заметный рывок в конце. Теперь offset=0 и обычная
        maxHeight применяются одновременно в режиме closing.
      */
      const closedLayout = getLayoutFromKeyboardInset(getLayoutViewportHeight(), 0, true);
      const closingLayout: KeyboardAwareSheetLayout = {
        ...closedLayout,
        isViewportChanging: true,
      };

      commitLayout(closingLayout, "closing");

      closeFinishTimerId = window.setTimeout(() => {
        closeFinishTimerId = null;
        finishKeyboardClose();
      }, KEYBOARD_CLOSE_SMOOTH_MS + 90);
    };

    const commitSameKeyboardFrozenLayout = () => {
      const frozenLayout = sameKeyboardFreezeLayoutRef.current;
      if (!frozenLayout) return false;
      if (Date.now() >= sameKeyboardFreezeUntilRef.current) {
        sameKeyboardFreezeUntilRef.current = 0;
        sameKeyboardFreezeLayoutRef.current = null;
        return false;
      }

      const stableLayout: KeyboardAwareSheetLayout = {
        ...frozenLayout,
        isViewportChanging: false,
      };

      latestLayoutRef.current = stableLayout;
      applySheetCssLayout(stableLayout, true, "idle");
      setLayout((previousLayout) =>
        isSameLayout(previousLayout, stableLayout) ? previousLayout : stableLayout,
      );
      return true;
    };

    const getMoveMode = (
      previousLayout: KeyboardAwareSheetLayout,
      nextLayout: KeyboardAwareSheetLayout,
    ): SheetMotionMode => {
      if (!nextLayout.isKeyboardOpen && previousLayout.isKeyboardOpen) return "closing";

      const delta = Math.abs(nextLayout.bottomOffset - previousLayout.bottomOffset);

      if (previousLayout.isKeyboardOpen && nextLayout.isKeyboardOpen && delta <= KEYBOARD_SWITCH_MAX_DELTA) {
        return "switching";
      }

      return "moving";
    };

    const handleViewportChangeFrame = () => {
      rafId = null;
      lockDocumentScrollPosition();

      const contentElement = contentRef.current;
      const activeElement = document.activeElement;
      const hasFocusedInputInsideSheet =
        activeElement instanceof HTMLElement &&
        contentElement?.contains(activeElement) === true &&
        shouldHandleFocusedElement(activeElement);

      if (keyboardClosingRef.current && !hasFocusedInputInsideSheet) {
        return;
      }

      if (hasFocusedInputInsideSheet && commitSameKeyboardFrozenLayout()) {
        scheduleIdle();
        return;
      }

      if (hasFocusedInputInsideSheet) {
        activeInputRef.current = activeElement;
        keyboardClosingRef.current = false;
        clearCloseFinishTimer();
      }

      const previousLayout = latestLayoutRef.current;
      const nextLayout = getNextLayout(true);
      const moveMode = getMoveMode(previousLayout, nextLayout);

      if (moveMode === "closing" && !hasFocusedInputInsideSheet) {
        beginKeyboardClose();
        return;
      }

      const layoutToApply = {
        ...nextLayout,
        isViewportChanging: true,
      };

      commitLayout(layoutToApply, moveMode);

      if (layoutToApply.isKeyboardOpen) {
        saveKeyboardInset(layoutToApply.bottomOffset, getLayoutViewportHeight());
      }

      scheduleIdle();
    };

    const scheduleViewportChange = () => {
      clearIdleTimer();

      if (rafId !== null) return;

      rafId = window.requestAnimationFrame(handleViewportChangeFrame);
    };

    applySheetCssLayout(latestLayoutRef.current, true, "idle");
    scheduleViewportChange();

    const handleWindowScroll = () => lockDocumentScrollPosition();

    window.visualViewport?.addEventListener("resize", scheduleViewportChange);
    window.visualViewport?.addEventListener("scroll", scheduleViewportChange);
    window.addEventListener("resize", scheduleViewportChange);
    window.addEventListener("orientationchange", scheduleViewportChange);
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      clearIdleTimer();
      clearCloseFinishTimer();

      window.visualViewport?.removeEventListener("resize", scheduleViewportChange);
      window.visualViewport?.removeEventListener("scroll", scheduleViewportChange);
      window.removeEventListener("resize", scheduleViewportChange);
      window.removeEventListener("orientationchange", scheduleViewportChange);
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [contentRef, open]);

  useEffect(() => {
    if (!open) return;

    const contentElement = contentRef.current;
    if (!contentElement) return;

    let focusTimerId: number | null = null;
    let settleFocusTimerId: number | null = null;
    let preopenRafId: number | null = null;
    let closeGraceTimerId: number | null = null;

    const clearFocusTimers = () => {
      if (focusTimerId !== null) {
        window.clearTimeout(focusTimerId);
        focusTimerId = null;
      }

      if (settleFocusTimerId !== null) {
        window.clearTimeout(settleFocusTimerId);
        settleFocusTimerId = null;
      }
    };

    const clearPreopenRaf = () => {
      if (preopenRafId !== null) {
        window.cancelAnimationFrame(preopenRafId);
        preopenRafId = null;
      }
    };

    const clearCloseGraceTimer = () => {
      if (closeGraceTimerId !== null) {
        window.clearTimeout(closeGraceTimerId);
        closeGraceTimerId = null;
      }
    };

    const scrollFocusedFieldIntoView = (target: HTMLElement, behavior: ScrollBehavior) => {
      if (!contentElement.contains(target)) return;

      lockDocumentScrollPosition();

      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = latestLayoutRef.current.isKeyboardOpen ? 100 : 58;

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

    const prepareFocusTarget = (target: EventTarget | null) => {
      if (!shouldHandleFocusedElement(target)) return null;

      const element = target as HTMLElement;
      if (!contentElement.contains(element)) return null;

      return element;
    };

    const freezeSameKeyboardFieldSwitch = () => {
      if (!latestLayoutRef.current.isKeyboardOpen) return;

      sameKeyboardFreezeUntilRef.current = Date.now() + SAME_KEYBOARD_FIELD_SWITCH_FREEZE_MS;
      sameKeyboardFreezeLayoutRef.current = {
        ...latestLayoutRef.current,
        isViewportChanging: false,
      };

      applySheetCssLayout(sameKeyboardFreezeLayoutRef.current, true, "idle");
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = prepareFocusTarget(event.target);
      if (!element) return;
      if (event.pointerType === "mouse") return;

      if (isSameKeyboardInputProfile(activeInputRef.current, element)) {
        freezeSameKeyboardFieldSwitch();
      }

      if (isSameKeyboardInputProfile(activeInputRef.current, element)) {
        freezeSameKeyboardFieldSwitch();
      }

      activeInputRef.current = element;
      pendingFocusTargetRef.current = element;
      focusSwitchGuardUntilRef.current = Date.now() + KEYBOARD_SWITCH_GUARD_MS;
      markKeyboardGesture();
      window.requestAnimationFrame(lockDocumentScrollPosition);
    };

    const handleTouchStart = (event: TouchEvent) => {
      const element = prepareFocusTarget(event.target);
      if (!element) return;

      activeInputRef.current = element;
      pendingFocusTargetRef.current = element;
      focusSwitchGuardUntilRef.current = Date.now() + KEYBOARD_SWITCH_GUARD_MS;
      markKeyboardGesture();
      window.requestAnimationFrame(lockDocumentScrollPosition);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = prepareFocusTarget(event.target);
      if (!target) return;

      const wasKeyboardOpen = latestLayoutRef.current.isKeyboardOpen;
      const isSameKeyboardFieldSwitch =
        wasKeyboardOpen && isSameKeyboardInputProfile(lastFocusedInputRef.current, target);

      if (isSameKeyboardFieldSwitch) {
        freezeSameKeyboardFieldSwitch();
      }

      const focusVersion = interactionVersionRef.current + 1;
      interactionVersionRef.current = focusVersion;
      keyboardClosingRef.current = false;
      activeInputRef.current = target;
      lastFocusedInputRef.current = target;
      pendingFocusTargetRef.current = null;
      focusSwitchGuardUntilRef.current = Date.now() + KEYBOARD_SWITCH_GUARD_MS;
      markKeyboardGesture();

      clearFocusTimers();
      clearPreopenRaf();
      clearCloseGraceTimer();
      lockDocumentScrollPosition();

      if (wasKeyboardOpen) {
        /*
          Важно: при переходе между полями внутри уже открытого sheet
          не трогаем position/maxHeight вообще. Особенно для width -> height,
          где клавиатура остаётся цифровой и visualViewport не должен менять
          sheet. Если высота клавиатуры реально изменится (text -> number),
          это поймает handleViewportChangeFrame через visualViewport resize.
        */
      } else if (shouldUseKeyboardPreopen()) {
        preopenRafId = window.requestAnimationFrame(() => {
          preopenRafId = null;
          if (focusVersion !== interactionVersionRef.current) return;
          if (document.activeElement !== target || !contentElement.contains(target)) return;

          const predictedLayout = getPredictedKeyboardLayout();
          latestLayoutRef.current = predictedLayout;
          applySheetCssLayout(predictedLayout, true, "preopen");
          setLayout((previousLayout) => (isSameLayout(previousLayout, predictedLayout) ? previousLayout : predictedLayout));
        });
      }

      if (!isSameKeyboardFieldSwitch) {
        focusTimerId = window.setTimeout(() => {
          if (focusVersion !== interactionVersionRef.current) return;
          if (activeInputRef.current) {
            scrollFocusedFieldIntoView(activeInputRef.current, "auto");
          }
        }, FOCUS_SCROLL_DELAY_MS);

        settleFocusTimerId = window.setTimeout(() => {
          if (focusVersion !== interactionVersionRef.current) return;
          if (activeInputRef.current) {
            scrollFocusedFieldIntoView(activeInputRef.current, "auto");
          }
        }, FOCUS_SCROLL_AFTER_SETTLE_MS);
      }
    };

    const maybeStartKeyboardClose = () => {
      closeGraceTimerId = null;

      const activeElement = document.activeElement;
      const isActiveInputInsideSheet =
        activeElement instanceof HTMLElement &&
        contentElement.contains(activeElement) &&
        shouldHandleFocusedElement(activeElement);

      if (isActiveInputInsideSheet) {
        activeInputRef.current = activeElement;
        return;
      }

      if (Date.now() < focusSwitchGuardUntilRef.current) {
        const delay = Math.max(70, focusSwitchGuardUntilRef.current - Date.now() + 30);
        closeGraceTimerId = window.setTimeout(maybeStartKeyboardClose, delay);
        return;
      }

      activeInputRef.current = null;

      if (latestLayoutRef.current.isKeyboardOpen) {
        keyboardClosingRef.current = true;

        const closedLayout = getLayoutFromKeyboardInset(getLayoutViewportHeight(), 0, true);
        const closingLayout: KeyboardAwareSheetLayout = {
          ...closedLayout,
          isViewportChanging: true,
        };

        latestLayoutRef.current = closingLayout;
        applySheetCssLayout(closingLayout, true, "closing");
        setLayout((previousLayout) =>
          isSameLayout(previousLayout, closingLayout) ? previousLayout : closingLayout,
        );
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;
      const pendingTarget = pendingFocusTargetRef.current;

      const isMovingFocusInsideSheet =
        (nextTarget instanceof HTMLElement &&
          contentElement.contains(nextTarget) &&
          shouldHandleFocusedElement(nextTarget)) ||
        (pendingTarget instanceof HTMLElement &&
          contentElement.contains(pendingTarget) &&
          pendingTarget !== event.target &&
          shouldHandleFocusedElement(pendingTarget));

      if (isMovingFocusInsideSheet) {
        /*
          Это переход input -> input внутри одного sheet.
          Не запускаем closing/preopen/switching, иначе ширина -> длина
          даёт лишний рывок, хотя клавиатура остаётся той же цифровой.
        */
        const fromElement = event.target instanceof HTMLElement ? event.target : activeInputRef.current;
        const toElement =
          nextTarget instanceof HTMLElement && contentElement.contains(nextTarget)
            ? nextTarget
            : pendingTarget;

        if (isSameKeyboardInputProfile(fromElement, toElement)) {
          freezeSameKeyboardFieldSwitch();
        }

        focusSwitchGuardUntilRef.current = Date.now() + KEYBOARD_SWITCH_GUARD_MS;
        window.requestAnimationFrame(lockDocumentScrollPosition);
        return;
      }

      const focusOutVersion = interactionVersionRef.current + 1;
      interactionVersionRef.current = focusOutVersion;

      clearFocusTimers();
      clearPreopenRaf();
      clearCloseGraceTimer();

      closeGraceTimerId = window.setTimeout(() => {
        if (focusOutVersion !== interactionVersionRef.current) return;
        maybeStartKeyboardClose();
      }, KEYBOARD_CLOSE_GRACE_MS);

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
      clearFocusTimers();
      clearPreopenRaf();
      clearCloseGraceTimer();
      activeInputRef.current = null;
      pendingFocusTargetRef.current = null;
      lastFocusedInputRef.current = null;
      sameKeyboardFreezeUntilRef.current = 0;
      sameKeyboardFreezeLayoutRef.current = null;

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
