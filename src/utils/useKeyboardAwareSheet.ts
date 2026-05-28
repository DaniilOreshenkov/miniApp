import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_GAP = 10;
const BOTTOM_GAP = 10;
const MIN_KEYBOARD_CARD_HEIGHT = 132;
const MAX_VISUAL_TOP_OFFSET = 120;
const KEYBOARD_THRESHOLD = 72;
const CLOSE_THRESHOLD = 32;
const MAX_KEYBOARD_OFFSET = 620;
const KEYBOARD_OFFSET_STEP = 4;
const LAYOUT_EPSILON = 4;
const SETTLE_DELAY_MS = 140;
const FINAL_SETTLE_DELAY_MS = 520;
const FOCUS_SCROLL_DELAY_MS = 70;
const FOCUS_SCROLL_SETTLE_DELAY_MS = 260;
const FIELD_SWITCH_HOLD_MS = 460;
// Frames of zero-delta inset before we declare the keyboard settled.
// 6 frames ≈ 100 ms at 60 fps — enough to reliably detect a stopped keyboard.
const STABLE_FRAMES = 6;

let fieldSwitchHoldUntil = 0;

export const prepareSheetFieldSwitch = (holdMs = FIELD_SWITCH_HOLD_MS) => {
  if (typeof window === "undefined") return;
  fieldSwitchHoldUntil = Date.now() + holdMs;
};

const isFieldSwitchHoldActive = () =>
  typeof window !== "undefined" && Date.now() < fieldSwitchHoldUntil;

export type KeyboardAwareSheetLayout = {
  frameTop: number;
  frameHeight: number;
  maxHeight: number;
  bottomOffset: number;
  isKeyboardOpen: boolean;
  isViewportChanging: boolean;
};

type Metrics = {
  stableHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

const normalizePx = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const readRootCssPx = (name: string, fallback = 0) => {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = Number(raw.replace("px", ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};

const getDocumentHeight = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    readRootCssPx("--tg-viewport-stable-height", 0),
    readRootCssPx("--app-height", 0),
  );
};

const readVisualViewport = () => {
  if (typeof window === "undefined") return { height: 0, offsetTop: 0 };
  const vv = window.visualViewport;
  const fallback = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!vv) return { height: normalizePx(readRootCssPx("--tg-viewport-height", fallback)), offsetTop: 0 };
  return { height: normalizePx(vv.height), offsetTop: normalizePx(vv.offsetTop) };
};

const roundKeyboardInset = (value: number) => {
  if (value <= 0) return 0;
  return Math.round(value / KEYBOARD_OFFSET_STEP) * KEYBOARD_OFFSET_STEP;
};

const getMetrics = (): Metrics => {
  if (typeof window === "undefined")
    return { stableHeight: 0, visualHeight: 0, visualOffsetTop: 0, keyboardInset: 0 };

  const visual = readVisualViewport();
  const stableHeight = Math.max(getDocumentHeight(), visual.height, 1);
  const visualBottom = visual.offsetTop + visual.height;
  const visualKeyboardInset = normalizePx(stableHeight - visualBottom);
  const telegramKeyboardInset = readRootCssPx("--tg-keyboard-offset", 0);
  const keyboardInset = clamp(
    roundKeyboardInset(Math.max(visualKeyboardInset, telegramKeyboardInset)),
    0,
    Math.min(MAX_KEYBOARD_OFFSET, stableHeight),
  );
  return { stableHeight, visualHeight: visual.height, visualOffsetTop: visual.offsetTop, keyboardInset };
};

const getTopLimit = () => {
  const top = Math.max(
    readRootCssPx("--app-safe-top", 0),
    readRootCssPx("--app-tg-sheet-top-limit", 0),
  );
  return Math.max(TOP_GAP, top + TOP_GAP);
};

const getBottomGap = () => {
  const bottom = Math.max(
    readRootCssPx("--sheet-bottom-gap", 0),
    readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0),
    readRootCssPx("--app-tg-safe-bottom", 0),
    readRootCssPx("--tg-safe-bottom", 0),
  );
  return Math.max(BOTTOM_GAP, bottom + BOTTOM_GAP);
};

/**
 * Core layout computation. Accepts pre-read metrics so callers can batch
 * all DOM reads before any DOM writes — avoids forced style flushes.
 */
const computeNextLayout = (
  metrics: Metrics,
  isViewportChanging = false,
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const wasKeyboardOpen = previousLayout?.isKeyboardOpen ?? false;

  if (isFieldSwitchHoldActive() && wasKeyboardOpen && previousLayout) {
    if (metrics.keyboardInset <= CLOSE_THRESHOLD)
      return { ...previousLayout, isKeyboardOpen: true, isViewportChanging };
    return { ...previousLayout, isViewportChanging };
  }

  const keyboardThreshold = wasKeyboardOpen ? CLOSE_THRESHOLD : KEYBOARD_THRESHOLD;
  const isKeyboardOpen = metrics.keyboardInset > keyboardThreshold;
  const keyboardInset = isKeyboardOpen ? metrics.keyboardInset : 0;

  const topLimit = getTopLimit();
  const bottomGap = getBottomGap();
  const visualTopOffset = isKeyboardOpen
    ? clamp(metrics.visualOffsetTop, 0, MAX_VISUAL_TOP_OFFSET)
    : 0;

  const frameTop = topLimit + visualTopOffset;
  const frameHeight = Math.max(
    MIN_KEYBOARD_CARD_HEIGHT,
    Math.floor(metrics.stableHeight - frameTop - bottomGap),
  );

  const availableAboveKeyboard = Math.max(0, Math.floor(frameHeight - keyboardInset));
  const keyboardMaxHeight = Math.max(0, Math.min(frameHeight, availableAboveKeyboard));
  const maxHeight = isKeyboardOpen ? keyboardMaxHeight : frameHeight;

  return { frameTop, frameHeight, maxHeight, bottomOffset: keyboardInset, isKeyboardOpen, isViewportChanging };
};

/** Convenience wrapper — reads metrics then delegates to computeNextLayout. */
const getNextLayout = (
  isViewportChanging = false,
  previousLayout?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => computeNextLayout(getMetrics(), isViewportChanging, previousLayout);

const isSameLayout = (a: KeyboardAwareSheetLayout, b: KeyboardAwareSheetLayout) =>
  Math.abs(a.frameTop - b.frameTop) <= LAYOUT_EPSILON &&
  Math.abs(a.frameHeight - b.frameHeight) <= LAYOUT_EPSILON &&
  Math.abs(a.maxHeight - b.maxHeight) <= LAYOUT_EPSILON &&
  Math.abs(a.bottomOffset - b.bottomOffset) <= LAYOUT_EPSILON &&
  a.isKeyboardOpen === b.isKeyboardOpen &&
  a.isViewportChanging === b.isViewportChanging;

const setRootSheetState = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  if (!isOpen) {
    root.style.setProperty("--sheet-keyboard-offset", "0px");
    root.style.setProperty("--sheet-max-height", "0px");
    return;
  }
  if (!layout) return;
  root.style.setProperty("--sheet-frame-top", `${layout.frameTop}px`);
  root.style.setProperty("--sheet-frame-height", `${layout.frameHeight}px`);
  root.style.setProperty("--sheet-keyboard-offset", `${layout.bottomOffset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
};

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isEditableElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
};

const clampScrollTop = (el: HTMLElement, next: number) =>
  Math.min(Math.max(0, el.scrollHeight - el.clientHeight), Math.max(0, Math.round(next)));

const scrollContentTo = (el: HTMLElement, top: number) => {
  try { el.scrollTo({ top, behavior: "smooth" }); } catch { el.scrollTop = top; }
};

export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
  lifterRef?: RefObject<HTMLElement | null>,
) => {
  const [layout, setLayout] = useState<KeyboardAwareSheetLayout>(() => getNextLayout(false));
  const latestLayoutRef = useRef(layout);
  const focusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
    setRootSheetState(open, layout);
  }, [layout, open]);

  useEffect(() => {
    if (!open) {
      setRootSheetState(false, latestLayoutRef.current);
      // Smoothly lower the lifter back to zero when the sheet closes.
      if (lifterRef?.current) {
        lifterRef.current.style.transition = "transform 280ms cubic-bezier(0.4, 0, 0.6, 1)";
        lifterRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      return;
    }

    resetDocumentScroll();
    setRootSheetState(true, latestLayoutRef.current);

    // Position the lifter at the current keyboard inset immediately (no flash).
    // transition:none here — the RAF loop drives every frame directly without CSS
    // interpolation, which gives frame-perfect keyboard tracking.
    const initialInset = getMetrics().keyboardInset;
    if (lifterRef?.current) {
      lifterRef.current.style.transition = "none";
      lifterRef.current.style.transform = `translate3d(0, -${initialInset}px, 0)`;
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollRafId: number | null = null;
    let stableFrameCount = 0;
    let lastRawInset = initialInset;

    // ─── commitLayout ────────────────────────────────────────────────────────
    // Updates class tokens and React state when layout changes.
    // Does NOT touch CSS vars (deferred to settle) and does NOT update the lifter
    // (handled by the RAF loop for pixel-perfect tracking).
    const commitLayout = (nextLayout: KeyboardAwareSheetLayout) => {
      if (isSameLayout(latestLayoutRef.current, nextLayout)) return;
      const wasOpen = latestLayoutRef.current.isKeyboardOpen;
      latestLayoutRef.current = nextLayout;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle(
          "tg-sheet-keyboard-open",
          nextLayout.isKeyboardOpen,
        );
      }
      if (nextLayout.isKeyboardOpen !== wasOpen) setLayout(nextLayout);
    };

    // ─── flushLayout ─────────────────────────────────────────────────────────
    // Triggers a React re-render only when a visually meaningful value changed.
    const flushLayout = () => {
      setLayout((prev) => {
        const next = { ...latestLayoutRef.current, isViewportChanging: false };
        if (
          Math.abs(prev.frameTop - next.frameTop) <= LAYOUT_EPSILON &&
          Math.abs(prev.frameHeight - next.frameHeight) <= LAYOUT_EPSILON &&
          Math.abs(prev.maxHeight - next.maxHeight) <= LAYOUT_EPSILON &&
          Math.abs(prev.bottomOffset - next.bottomOffset) <= LAYOUT_EPSILON &&
          prev.isKeyboardOpen === next.isKeyboardOpen
        ) return prev;
        return next;
      });
    };

    // ─── applyChangingLayout ─────────────────────────────────────────────────
    // Self-rescheduling RAF loop. Key discipline: ALL DOM reads before ANY writes
    // to prevent forced style flushes (write → read = browser must flush pending
    // styles synchronously, which is the #1 source of per-frame jank).
    const applyChangingLayout = () => {
      // ── READS ──────────────────────────────────────────────────────────────
      const metrics = getMetrics();                  // single read per frame
      const rawInset = metrics.keyboardInset;
      const targetInset = isFieldSwitchHoldActive()
        ? latestLayoutRef.current.bottomOffset       // frozen during field switch
        : rawInset;
      // Re-use the same metrics object so getNextLayout skips a second getMetrics() call.
      const nextLayout = computeNextLayout(metrics, true, latestLayoutRef.current);

      // ── WRITES ─────────────────────────────────────────────────────────────
      // Lifter: no CSS transition — the loop fires every frame, so direct
      // assignment gives frame-perfect tracking without interpolation lag.
      if (lifterRef?.current) {
        lifterRef.current.style.transform = `translate3d(0, -${targetInset}px, 0)`;
      }
      // Class/state update only when layout crosses a meaningful threshold.
      commitLayout(nextLayout);

      // ── LOOP CONTROL ───────────────────────────────────────────────────────
      if (Math.abs(rawInset - lastRawInset) <= 1) {
        stableFrameCount++;
      } else {
        stableFrameCount = 0;
      }
      lastRawInset = rawInset;

      if (stableFrameCount < STABLE_FRAMES) {
        rafId = window.requestAnimationFrame(applyChangingLayout);
      } else {
        rafId = null;
        applyStableLayout(true); // keyboard stopped — hard snap + CSS var sync
      }
    };

    // ─── applyStableLayout ───────────────────────────────────────────────────
    const applyStableLayout = (snapLifter = true) => {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      const next = getNextLayout(false, latestLayoutRef.current);
      if (!isSameLayout(latestLayoutRef.current, next)) latestLayoutRef.current = next;
      // Sync CSS vars only at settle — not per-RAF — to avoid inherited @property
      // recalcs cascading across the whole document every frame.
      setRootSheetState(true, latestLayoutRef.current);
      if (snapLifter && lifterRef?.current) {
        // Hard-snap to the exact settled position; transition:none because the
        // keyboard has stopped and there's nothing left to interpolate.
        lifterRef.current.style.transition = "none";
        lifterRef.current.style.transform =
          `translate3d(0, -${latestLayoutRef.current.bottomOffset}px, 0)`;
      }
      flushLayout();
    };

    // ─── scheduleLayout ──────────────────────────────────────────────────────
    // Called on every viewport event. Resets the stability counter so the loop
    // keeps running while the keyboard is moving.
    const scheduleLayout = () => {
      stableFrameCount = 0;
      if (rafId === null) rafId = window.requestAnimationFrame(applyChangingLayout);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      // Soft settle: sync React state / CSS vars, no lifter snap.
      settleTimerId = window.setTimeout(() => applyStableLayout(false), SETTLE_DELAY_MS);
      // Hard settle: safety-net in case the in-loop stability detector fires late.
      finalSettleTimerId = window.setTimeout(() => applyStableLayout(true), FINAL_SETTLE_DELAY_MS);
    };

    const lockDocumentScroll = () => {
      if (scrollRafId !== null) return;
      scrollRafId = window.requestAnimationFrame(() => { scrollRafId = null; resetDocumentScroll(); });
    };

    scheduleLayout();

    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);
    window.addEventListener("app:telegram-viewport-change", scheduleLayout);
    window.addEventListener("scroll", lockDocumentScroll, { passive: true });
    document.addEventListener("scroll", lockDocumentScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);
      window.visualViewport?.removeEventListener("resize", scheduleLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("orientationchange", scheduleLayout);
      window.removeEventListener("app:telegram-viewport-change", scheduleLayout);
      window.removeEventListener("scroll", lockDocumentScroll);
      document.removeEventListener("scroll", lockDocumentScroll);
    };
  }, [open]);

  // ─── Focus / scroll management ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const contentElement = contentRef.current;
    if (!contentElement) return;

    let firstScrollTimerId: number | null = null;
    let settleScrollTimerId: number | null = null;

    const scrollFocusedFieldIntoView = (target: HTMLElement) => {
      if (!contentElement.contains(target)) return;
      const contentRect = contentElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = latestLayoutRef.current.isKeyboardOpen ? 96 : 72;
      let nextScrollTop = contentElement.scrollTop;
      if (targetRect.top < contentRect.top + topGap)
        nextScrollTop += targetRect.top - contentRect.top - topGap;
      else if (targetRect.bottom > contentRect.bottom - bottomGap)
        nextScrollTop += targetRect.bottom - contentRect.bottom + bottomGap;
      const clamped = clampScrollTop(contentElement, nextScrollTop);
      if (Math.abs(clamped - contentElement.scrollTop) > 1) scrollContentTo(contentElement, clamped);
    };

    const scheduleFocusedScroll = (target: HTMLElement) => {
      focusedElementRef.current = target;
      if (firstScrollTimerId !== null) window.clearTimeout(firstScrollTimerId);
      if (settleScrollTimerId !== null) window.clearTimeout(settleScrollTimerId);
      firstScrollTimerId = window.setTimeout(() => {
        if (focusedElementRef.current) scrollFocusedFieldIntoView(focusedElementRef.current);
      }, FOCUS_SCROLL_DELAY_MS);
      settleScrollTimerId = window.setTimeout(() => {
        if (focusedElementRef.current) scrollFocusedFieldIntoView(focusedElementRef.current);
      }, FOCUS_SCROLL_SETTLE_DELAY_MS);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;
      const target = event.target as HTMLElement;
      if (!contentElement.contains(target)) return;
      resetDocumentScroll();
      scheduleFocusedScroll(target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof HTMLElement && contentElement.contains(next)) return;
      focusedElementRef.current = null;
    };

    const handleInput = () => {
      if (focusedElementRef.current) scheduleFocusedScroll(focusedElementRef.current);
    };

    contentElement.addEventListener("focusin", handleFocusIn);
    contentElement.addEventListener("focusout", handleFocusOut);
    contentElement.addEventListener("input", handleInput);

    return () => {
      if (firstScrollTimerId !== null) window.clearTimeout(firstScrollTimerId);
      if (settleScrollTimerId !== null) window.clearTimeout(settleScrollTimerId);
      focusedElementRef.current = null;
      contentElement.removeEventListener("focusin", handleFocusIn);
      contentElement.removeEventListener("focusout", handleFocusOut);
      contentElement.removeEventListener("input", handleInput);
    };
  }, [contentRef, open]);

  return layout;
};
