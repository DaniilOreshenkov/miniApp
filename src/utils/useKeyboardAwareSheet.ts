/**
 * useKeyboardAwareSheet — keyboard-tracking bottom sheet hook
 *
 * Architecture (why it's smooth):
 *
 * The single biggest source of per-frame jitter in a React sheet is mixing
 * React state updates with direct DOM writes. React state goes through the
 * reconciler and paints in a DIFFERENT frame from the RAF callback that wrote
 * to the DOM ref — so the lifter and the card end up in different frames.
 *
 * Fix: ALL visual geometry is applied to DOM refs inside one synchronous
 * write batch per RAF tick:
 *
 *   lifterRef.current.style.transform  ← rises with keyboard, every frame
 *   cardRef.current.style.maxHeight    ← shrinks as keyboard rises, same frame
 *
 * Frame top/height change only at stable-settle (keyboard stopped), so they go
 * through CSS vars — no per-frame overhead, no React reconciler latency.
 *
 * React state = only `isKeyboardOpen` (bool). It is updated ONCE at settle,
 * triggering exactly one re-render for content-padding adjustments. Zero
 * re-renders while the keyboard is animating.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOP_GAP = 10;
const BOTTOM_GAP = 4;
const MIN_KEYBOARD_CARD_HEIGHT = 132;
const MAX_VISUAL_TOP_OFFSET = 120;
const MAX_KEYBOARD_OFFSET = 620;

// Hysteresis: open when inset > OPEN_THRESHOLD, close when inset < CLOSE_THRESHOLD.
const OPEN_THRESHOLD = 72;
const CLOSE_THRESHOLD = 32;

// Frames of zero-delta inset before we declare the keyboard settled (~100 ms @ 60 fps).
const STABLE_FRAMES = 6;

// How long after the last viewport event we do a "soft" sync (CSS vars + state).
const SETTLE_DELAY_MS = 140;

// Safety-net full settle in case stability detector fires late (iOS kbd ~400-500 ms).
const FINAL_SETTLE_DELAY_MS = 520;

const FOCUS_SCROLL_DELAY_MS = 70;
const FOCUS_SCROLL_SETTLE_DELAY_MS = 260;
const FIELD_SWITCH_HOLD_MS = 460;

// ─── Field-switch hold ────────────────────────────────────────────────────────
// When the user taps from one field to another, the keyboard briefly closes then
// reopens. We freeze the lifter position for FIELD_SWITCH_HOLD_MS to prevent a
// visible dip.
let fieldSwitchHoldUntil = 0;

export const prepareSheetFieldSwitch = (holdMs = FIELD_SWITCH_HOLD_MS) => {
  if (typeof window === "undefined") return;
  fieldSwitchHoldUntil = Date.now() + holdMs;
};

const isFieldSwitchHoldActive = () =>
  typeof window !== "undefined" && Date.now() < fieldSwitchHoldUntil;

// ─── Layout type ─────────────────────────────────────────────────────────────
export type KeyboardAwareSheetLayout = {
  frameTop: number;
  frameHeight: number;
  maxHeight: number;
  bottomOffset: number; // current keyboard inset (used to position lifter at settle)
  isKeyboardOpen: boolean;
};

// ─── Metrics ─────────────────────────────────────────────────────────────────
type Metrics = {
  stableHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  keyboardInset: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const normalizePx = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const readRootCssPx = (name: string, fallback = 0): number => {
  if (typeof window === "undefined") return fallback;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = Number(raw.replace("px", ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};

const getDocumentHeight = (): number => {
  if (typeof window === "undefined") return 0;
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
  if (!vv) return { height: normalizePx(window.innerHeight || 0), offsetTop: 0 };
  return { height: normalizePx(vv.height), offsetTop: normalizePx(vv.offsetTop) };
};

// ─── Metrics read (ALL reads, no writes) ─────────────────────────────────────
const getMetrics = (): Metrics => {
  if (typeof window === "undefined")
    return { stableHeight: 0, visualHeight: 0, visualOffsetTop: 0, keyboardInset: 0 };

  const visual = readVisualViewport();
  const stableHeight = Math.max(getDocumentHeight(), visual.height, 1);
  const visualBottom = visual.offsetTop + visual.height;
  const visualInset = normalizePx(stableHeight - visualBottom);
  const tgInset = readRootCssPx("--tg-keyboard-offset", 0);
  // Raw pixel value — no rounding to multiples of N (that causes staircase jitter).
  const keyboardInset = clamp(
    normalizePx(Math.max(visualInset, tgInset)),
    0,
    Math.min(MAX_KEYBOARD_OFFSET, stableHeight),
  );
  return { stableHeight, visualHeight: visual.height, visualOffsetTop: visual.offsetTop, keyboardInset };
};

// ─── Cached layout constants (safe-area insets rarely change) ────────────────
// Recomputed only at stable settle, not per-RAF. Reading CSS vars every frame
// is cheap, but batching it to settle avoids any theoretical flush risk.
let _cachedTopLimit = -1;
let _cachedBottomGap = -1;

const computeTopLimit = () =>
  Math.max(
    TOP_GAP,
    Math.max(
      readRootCssPx("--app-safe-top", 0),
      readRootCssPx("--app-tg-sheet-top-limit", 0),
    ) + TOP_GAP,
  );

const computeBottomGap = () =>
  Math.max(
    BOTTOM_GAP,
    Math.max(
      readRootCssPx("--sheet-bottom-gap", 0),
      readRootCssPx("--app-tg-content-safe-area-inset-bottom", 0),
      readRootCssPx("--app-tg-safe-bottom", 0),
      readRootCssPx("--tg-safe-bottom", 0),
    ) + BOTTOM_GAP,
  );

const getTopLimit = () => (_cachedTopLimit < 0 ? (_cachedTopLimit = computeTopLimit()) : _cachedTopLimit);
const getBottomGap = () => (_cachedBottomGap < 0 ? (_cachedBottomGap = computeBottomGap()) : _cachedBottomGap);
const invalidateLayoutCache = () => { _cachedTopLimit = -1; _cachedBottomGap = -1; };

// ─── Core layout computation ──────────────────────────────────────────────────
// Accepts pre-read Metrics so every caller does exactly ONE DOM-read pass.
const computeLayout = (
  metrics: Metrics,
  previous?: KeyboardAwareSheetLayout,
): KeyboardAwareSheetLayout => {
  const wasKeyboardOpen = previous?.isKeyboardOpen ?? false;

  // During field-switch hold: freeze layout at the previous value.
  if (isFieldSwitchHoldActive() && wasKeyboardOpen && previous) {
    if (metrics.keyboardInset <= CLOSE_THRESHOLD)
      return { ...previous, isKeyboardOpen: true };
    return { ...previous };
  }

  const threshold = wasKeyboardOpen ? CLOSE_THRESHOLD : OPEN_THRESHOLD;
  const isKeyboardOpen = metrics.keyboardInset > threshold;
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
  const maxHeight = isKeyboardOpen
    ? Math.max(0, Math.min(frameHeight, availableAboveKeyboard))
    : frameHeight;

  return { frameTop, frameHeight, maxHeight, bottomOffset: keyboardInset, isKeyboardOpen };
};

// ─── CSS vars (settle-only — never per-RAF) ───────────────────────────────────
// --sheet-keyboard-offset and --sheet-max-height are @property inherits:true.
// Writing them per-RAF would cascade a style-recalc across every element on
// every frame. We write them ONLY at settle (keyboard stopped).
const syncRootVars = (isOpen: boolean, layout?: KeyboardAwareSheetLayout) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("tg-sheet-open", isOpen);
  root.classList.toggle("tg-sheet-keyboard-open", Boolean(isOpen && layout?.isKeyboardOpen));
  if (!isOpen) {
    root.style.setProperty("--sheet-keyboard-offset", "0px");
    root.style.setProperty("--sheet-max-height", "0px");
    root.style.setProperty("--sheet-frame-top", "10px");
    root.style.setProperty("--sheet-frame-height", "100dvh");
    return;
  }
  if (!layout) return;
  root.style.setProperty("--sheet-frame-top", `${layout.frameTop}px`);
  root.style.setProperty("--sheet-frame-height", `${layout.frameHeight}px`);
  root.style.setProperty("--sheet-keyboard-offset", `${layout.bottomOffset}px`);
  root.style.setProperty("--sheet-max-height", `${layout.maxHeight}px`);
};

// ─── Misc helpers ─────────────────────────────────────────────────────────────
const resetDocumentScroll = () => {
  if (typeof window === "undefined") return;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * @param open        Whether the sheet is mounted and visible.
 * @param contentRef  Scrollable content area (for focus-scroll management).
 * @param lifterRef   The element whose transform rises with the keyboard.
 * @param cardRef     The card element — hook sets style.maxHeight directly.
 * @returns           `isKeyboardOpen` — use for content-layout adjustments only.
 *                    All geometry (frame pos, maxHeight, lifter) is applied via refs.
 */
export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
  lifterRef: RefObject<HTMLElement | null>,
  cardRef: RefObject<HTMLElement | null>,
): boolean => {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Ref-tracked layout — the single source of truth during RAF animation.
  // Never read from React state inside RAF; that could be stale.
  const latestLayoutRef = useRef<KeyboardAwareSheetLayout | null>(null);

  // Mirrors isKeyboardOpen state without stale-closure risk inside callbacks.
  const isKeyboardOpenRef = useRef(false);

  const focusedElementRef = useRef<HTMLElement | null>(null);

  // ── Keyboard + geometry effect ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      // ── CLOSE ──────────────────────────────────────────────────────────────
      // Animate lifter back to baseline; reset CSS vars; sync React state.
      isKeyboardOpenRef.current = false;
      setIsKeyboardOpen(false);
      syncRootVars(false);
      if (lifterRef?.current) {
        lifterRef.current.style.transition = "transform 280ms cubic-bezier(0.4, 0, 0.6, 1)";
        lifterRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      return;
    }

    // ── OPEN ───────────────────────────────────────────────────────────────
    resetDocumentScroll();
    invalidateLayoutCache();

    // Snapshot initial geometry synchronously (before any RAF).
    const initialMetrics = getMetrics();
    const initialLayout = computeLayout(initialMetrics, latestLayoutRef.current ?? undefined);
    latestLayoutRef.current = initialLayout;

    // Apply immediately so there's no flash before the RAF loop starts.
    writeGeometry(initialLayout, initialMetrics.keyboardInset, false);
    syncRootVars(true, initialLayout);

    if (initialLayout.isKeyboardOpen !== isKeyboardOpenRef.current) {
      isKeyboardOpenRef.current = initialLayout.isKeyboardOpen;
      setIsKeyboardOpen(initialLayout.isKeyboardOpen);
    }

    let rafId: number | null = null;
    let settleTimerId: number | null = null;
    let finalSettleTimerId: number | null = null;
    let scrollRafId: number | null = null;
    let stableFrameCount = 0;
    let lastRawInset = initialMetrics.keyboardInset;

    // ── writeGeometry ─────────────────────────────────────────────────────
    // All DOM writes in one synchronous batch — lifter + card in the same frame.
    // No React state touched here; that stays frozen during animation.
    function writeGeometry(
      layout: KeyboardAwareSheetLayout,
      lifterInset: number,
      withLifterTransition: boolean,
    ) {
      if (lifterRef?.current) {
        lifterRef.current.style.transition = withLifterTransition
          ? "transform 280ms cubic-bezier(0.4, 0, 0.6, 1)"
          : "none";
        lifterRef.current.style.transform = `translate3d(0, -${lifterInset}px, 0)`;
      }
      if (cardRef?.current) {
        // maxHeight is NOT in the React style prop, so React will never clobber it.
        cardRef.current.style.maxHeight = `${layout.maxHeight}px`;
      }
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle(
          "tg-sheet-keyboard-open",
          layout.isKeyboardOpen,
        );
      }
    }

    // ── RAF tick ──────────────────────────────────────────────────────────
    // Reads first (getMetrics), then writes (writeGeometry) — no interleaving.
    // This is the ONLY place the lifter and card maxHeight are written during animation.
    // React state is intentionally NOT updated here; one re-render per settle is enough.
    const tick = () => {
      // ALL READS ──────────────────────────────────────────────────────────
      const metrics = getMetrics();
      const rawInset = metrics.keyboardInset;
      // During field-switch hold, freeze lifter at last known bottomOffset.
      const lifterInset = isFieldSwitchHoldActive()
        ? (latestLayoutRef.current?.bottomOffset ?? rawInset)
        : rawInset;
      const nextLayout = computeLayout(metrics, latestLayoutRef.current ?? undefined);

      // ALL WRITES ─────────────────────────────────────────────────────────
      latestLayoutRef.current = nextLayout;
      writeGeometry(nextLayout, lifterInset, false);
      // ↑ No setIsKeyboardOpen here — keeps animation free of React renders.

      // Stability check: if inset hasn't moved for STABLE_FRAMES, keyboard stopped.
      if (Math.abs(rawInset - lastRawInset) <= 1) stableFrameCount++;
      else stableFrameCount = 0;
      lastRawInset = rawInset;

      if (stableFrameCount < STABLE_FRAMES) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = null;
        settle(true); // keyboard stopped — full snap + CSS var sync
      }
    };

    // ── settle ────────────────────────────────────────────────────────────
    // Called when keyboard animation ends (either via stability detector or timer).
    // This is where CSS vars and React state are updated — exactly once per event.
    const settle = (snapLifter: boolean) => {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }

      invalidateLayoutCache(); // re-read safe-area insets (could have changed)
      const metrics = getMetrics();
      const next = computeLayout(metrics, latestLayoutRef.current ?? undefined);
      latestLayoutRef.current = next;

      // CSS vars — update frame top/height and keyboard offset at rest.
      syncRootVars(true, next);

      // DOM snap — lifter and card to their final resting positions.
      if (snapLifter) {
        writeGeometry(next, next.bottomOffset, false);
      } else {
        // Soft settle: just update card maxHeight, don't snap lifter.
        if (cardRef?.current) cardRef.current.style.maxHeight = `${next.maxHeight}px`;
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("tg-sheet-keyboard-open", next.isKeyboardOpen);
        }
      }

      // React re-render — triggers content-layout adjustments (padding etc.).
      // Fired only when isKeyboardOpen actually flips, so at most once per event.
      if (next.isKeyboardOpen !== isKeyboardOpenRef.current) {
        isKeyboardOpenRef.current = next.isKeyboardOpen;
        setIsKeyboardOpen(next.isKeyboardOpen);
      }
    };

    // ── scheduleLayout ────────────────────────────────────────────────────
    // Entry point for all viewport events. Restarts the RAF loop and resets
    // the soft + hard settle timers.
    const scheduleLayout = () => {
      stableFrameCount = 0;
      if (rafId === null) rafId = window.requestAnimationFrame(tick);
      if (settleTimerId !== null) window.clearTimeout(settleTimerId);
      if (finalSettleTimerId !== null) window.clearTimeout(finalSettleTimerId);
      // Soft settle: sync state + CSS vars without snapping lifter.
      settleTimerId = window.setTimeout(() => settle(false), SETTLE_DELAY_MS);
      // Hard settle: safety net — snap everything if stability detector was slow.
      finalSettleTimerId = window.setTimeout(() => settle(true), FINAL_SETTLE_DELAY_MS);
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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ lifterRef and cardRef are stable React refs — safe to omit from deps.

  // ── Focus / scroll management ─────────────────────────────────────────────
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
      const bottomGap = latestLayoutRef.current?.isKeyboardOpen ? 96 : 72;
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

  return isKeyboardOpen;
};
