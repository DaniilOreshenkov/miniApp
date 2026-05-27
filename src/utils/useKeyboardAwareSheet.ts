import { useEffect, useRef, useState, type RefObject } from "react";

// ── Константы ────────────────────────────────────────────────────────────────

/** Порог обнаружения открытия клавиатуры (px). */
const KEYBOARD_THRESHOLD = 72;
/** Порог обнаружения закрытия клавиатуры (px). */
const CLOSE_THRESHOLD = 32;
/** Шаг округления высоты клавиатуры. */
const KEYBOARD_STEP = 4;
/** Settle-задержки после изменения viewport. */
const SETTLE_MS = 140;
const FINAL_SETTLE_MS = 320;
/** Задержки для прокрутки к сфокусированному полю. */
const FOCUS_SCROLL_MS = 70;
const FOCUS_SCROLL_SETTLE_MS = 260;
/** Пауза при переключении между полями ввода. */
const FIELD_SWITCH_HOLD_MS = 460;

// ── Field-switch hold ────────────────────────────────────────────────────────

let fieldSwitchHoldUntil = 0;

/**
 * Вызывать перед программным переключением фокуса между полями в sheet.
 * Удерживает высоту клавиатуры стабильной на время holdMs,
 * чтобы sheet не прыгал при смене активного input.
 */
export const prepareSheetFieldSwitch = (holdMs = FIELD_SWITCH_HOLD_MS) => {
  if (typeof window === "undefined") return;
  fieldSwitchHoldUntil = Date.now() + holdMs;
};

const isFieldSwitchActive = () =>
  typeof window !== "undefined" && Date.now() < fieldSwitchHoldUntil;

// ── CSS-переменные ────────────────────────────────────────────────────────────

const setCssVar = (name: string, valuePx: number) => {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(name, `${valuePx}px`);
};

const readCssPx = (name: string): number => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return 0;
  const n = Number(raw.replace("px", ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

// ── Высота клавиатуры ────────────────────────────────────────────────────────

const getStableHeight = (): number => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    readCssPx("--tg-viewport-stable-height"),
    readCssPx("--app-height"),
  );
};

const measureKeyboardHeight = (wasKeyboardOpen: boolean): number => {
  if (typeof window === "undefined") return 0;

  const vv = window.visualViewport;
  const stableH = getStableHeight();
  const visualBottom = vv ? vv.offsetTop + vv.height : (window.innerHeight || 0);
  const visualInset = Math.max(0, stableH - visualBottom);
  const tgInset = readCssPx("--tg-keyboard-offset");

  const raw = Math.max(visualInset, tgInset);
  const rounded = Math.round(raw / KEYBOARD_STEP) * KEYBOARD_STEP;
  const threshold = wasKeyboardOpen ? CLOSE_THRESHOLD : KEYBOARD_THRESHOLD;

  return rounded > threshold ? rounded : 0;
};

// ── Scroll helpers ────────────────────────────────────────────────────────────

const resetDocumentScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isEditable = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
};

// ── Тип ──────────────────────────────────────────────────────────────────────

export type SheetLayout = {
  /** true когда клавиатура видимо открыта. */
  isKeyboardOpen: boolean;
};

// ── Хук ──────────────────────────────────────────────────────────────────────

/**
 * Отслеживает высоту клавиатуры и записывает её в CSS-переменную
 * `--sheet-keyboard-height`. Шит-фрейм реагирует на неё через CSS:
 *
 *   bottom: var(--sheet-keyboard-height, 0px)
 *
 * Никаких JS-вычислений позиции: top/height фрейма — чистый CSS.
 */
export const useKeyboardAwareSheet = (
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
): SheetLayout => {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const kbOpenRef = useRef(false);
  const focusedRef = useRef<HTMLElement | null>(null);

  // ── Keyboard detection ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      document.documentElement.classList.remove("tg-sheet-open", "tg-sheet-keyboard-open");
      setCssVar("--sheet-keyboard-height", 0);
      if (kbOpenRef.current) {
        kbOpenRef.current = false;
        setIsKeyboardOpen(false);
      }
      return;
    }

    resetDocumentScroll();
    document.documentElement.classList.add("tg-sheet-open");

    let rafId: number | null = null;
    let settleId: number | null = null;
    let finalSettleId: number | null = null;
    let scrollLockRafId: number | null = null;

    const applyLayout = () => {
      rafId = null;

      const kbH = measureKeyboardHeight(kbOpenRef.current);
      const nextKbOpen = kbH > 0;

      // Держим старую высоту при переключении полей ввода.
      if (kbOpenRef.current && !nextKbOpen && isFieldSwitchActive()) return;

      setCssVar("--sheet-keyboard-height", kbH);

      if (nextKbOpen !== kbOpenRef.current) {
        kbOpenRef.current = nextKbOpen;
        setIsKeyboardOpen(nextKbOpen);
        document.documentElement.classList.toggle("tg-sheet-keyboard-open", nextKbOpen);
      }
    };

    const schedule = () => {
      if (rafId === null) rafId = window.requestAnimationFrame(applyLayout);
      if (settleId !== null) window.clearTimeout(settleId);
      if (finalSettleId !== null) window.clearTimeout(finalSettleId);
      settleId = window.setTimeout(applyLayout, SETTLE_MS);
      finalSettleId = window.setTimeout(applyLayout, FINAL_SETTLE_MS);
    };

    const lockScroll = () => {
      if (scrollLockRafId !== null) return;
      scrollLockRafId = window.requestAnimationFrame(() => {
        scrollLockRafId = null;
        resetDocumentScroll();
      });
    };

    schedule();
    window.setTimeout(applyLayout, 80);
    window.setTimeout(applyLayout, 240);

    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("app:telegram-viewport-change", schedule);
    window.addEventListener("scroll", lockScroll, { passive: true });
    document.addEventListener("scroll", lockScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (settleId !== null) window.clearTimeout(settleId);
      if (finalSettleId !== null) window.clearTimeout(finalSettleId);
      if (scrollLockRafId !== null) window.cancelAnimationFrame(scrollLockRafId);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("app:telegram-viewport-change", schedule);
      window.removeEventListener("scroll", lockScroll);
      document.removeEventListener("scroll", lockScroll);
    };
  }, [open]);

  // ── Scroll focused field into view ──────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const contentEl = contentRef.current;
    if (!contentEl) return;

    let timer1: number | null = null;
    let timer2: number | null = null;

    const scrollIntoView = (target: HTMLElement) => {
      if (!contentEl.contains(target)) return;
      const cRect = contentEl.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const topGap = 18;
      const bottomGap = kbOpenRef.current ? 96 : 72;

      let next = contentEl.scrollTop;
      if (tRect.top < cRect.top + topGap) {
        next += tRect.top - cRect.top - topGap;
      } else if (tRect.bottom > cRect.bottom - bottomGap) {
        next += tRect.bottom - cRect.bottom + bottomGap;
      }

      const maxScroll = Math.max(0, contentEl.scrollHeight - contentEl.clientHeight);
      const clamped = Math.min(maxScroll, Math.max(0, Math.round(next)));
      if (Math.abs(clamped - contentEl.scrollTop) > 1) {
        try { contentEl.scrollTo({ top: clamped, behavior: "smooth" }); }
        catch { contentEl.scrollTop = clamped; }
      }
    };

    const scheduleScroll = (target: HTMLElement) => {
      focusedRef.current = target;
      if (timer1 !== null) window.clearTimeout(timer1);
      if (timer2 !== null) window.clearTimeout(timer2);
      timer1 = window.setTimeout(() => { if (focusedRef.current) scrollIntoView(focusedRef.current); }, FOCUS_SCROLL_MS);
      timer2 = window.setTimeout(() => { if (focusedRef.current) scrollIntoView(focusedRef.current); }, FOCUS_SCROLL_SETTLE_MS);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      const target = e.target as HTMLElement;
      if (!contentEl.contains(target)) return;
      resetDocumentScroll();
      scheduleScroll(target);
    };

    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof HTMLElement && contentEl.contains(next)) return;
      focusedRef.current = null;
    };

    const onInput = () => {
      if (focusedRef.current) scheduleScroll(focusedRef.current);
    };

    contentEl.addEventListener("focusin", onFocusIn);
    contentEl.addEventListener("focusout", onFocusOut);
    contentEl.addEventListener("input", onInput);

    return () => {
      if (timer1 !== null) window.clearTimeout(timer1);
      if (timer2 !== null) window.clearTimeout(timer2);
      focusedRef.current = null;
      contentEl.removeEventListener("focusin", onFocusIn);
      contentEl.removeEventListener("focusout", onFocusOut);
      contentEl.removeEventListener("input", onInput);
    };
  }, [open, contentRef]);

  return { isKeyboardOpen };
};
