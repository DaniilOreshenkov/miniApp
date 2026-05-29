/**
 * ScreenTransition — слайд-анимация между экранами.
 *
 * Push (forward):
 *   entering  → translateX(100% → 0)       z-index выше
 *   exiting   → translateX(0 → -22%)        параллакс как в iOS
 *
 * Pop (backward):
 *   entering  → translateX(-22% → 0)        возвращается из-за
 *   exiting   → translateX(0 → 100%)        уезжает вправо
 *
 * Архитектура:
 *   - два RAF перед запуском transition чтобы DOM успел отрисовать start-keyframe
 *   - exiting screen держится в DOM UNMOUNT_MS после старта, потом удаляется
 *   - willChange: transform только во время анимации — иначе жрёт память
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export type TransitionDirection = "forward" | "backward" | "none";

// Глубина экранов — определяет направление анимации автоматически
export const SCREEN_DEPTH: Record<string, number> = {
  home: 0,
  create: 1,
  import: 1,
  grid: 1,
};

const DURATION_MS = 320;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// Насколько "уезжает" уходящий экран (параллакс)
const PARALLAX_OFFSET = "22%";

type ScreenSlot = {
  key: string;
  node: React.ReactNode;
  role: "active" | "entering" | "exiting";
  direction: TransitionDirection;
};

type Props = {
  screenKey: string;
  screens: Record<string, React.ReactNode>;
};

const getTransform = (
  role: "active" | "entering" | "exiting",
  direction: TransitionDirection,
  phase: "start" | "running",
): string => {
  if (role === "active") return "translateX(0)";

  if (role === "entering") {
    if (phase === "running") return "translateX(0)";
    // forward: новый экран стартует справа
    // backward: предыдущий экран чуть сдвинут влево (открывается из-за уходящего)
    return direction === "forward"
      ? "translateX(100%)"
      : `translateX(-${PARALLAX_OFFSET})`;
  }

  // exiting
  if (phase === "start") return "translateX(0)";
  // forward: старый экран уходит чуть влево (параллакс)
  // backward: текущий экран уезжает полностью вправо
  return direction === "forward"
    ? `translateX(-${PARALLAX_OFFSET})`
    : "translateX(100%)";
};

const ScreenTransition: React.FC<Props> = ({ screenKey, screens }) => {
  // Текущий отображаемый ключ (settled)
  const prevKeyRef = useRef(screenKey);
  const [slots, setSlots] = useState<ScreenSlot[]>([
    { key: screenKey, node: screens[screenKey], role: "active", direction: "none" },
  ]);
  const [phase, setPhase] = useState<"start" | "running" | "idle">("idle");
  const cleanupRef = useRef<number | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (screenKey === prevKeyRef.current) return;

    const from = prevKeyRef.current;
    const to = screenKey;
    prevKeyRef.current = to;

    const fromDepth = SCREEN_DEPTH[from] ?? 0;
    const toDepth = SCREEN_DEPTH[to] ?? 0;
    const direction: TransitionDirection =
      toDepth > fromDepth ? "forward" : toDepth < fromDepth ? "backward" : "forward";

    // Очищаем предыдущую анимацию если ещё шла
    if (cleanupRef.current !== null) window.clearTimeout(cleanupRef.current);
    if (raf1Ref.current !== null) window.cancelAnimationFrame(raf1Ref.current);
    if (raf2Ref.current !== null) window.cancelAnimationFrame(raf2Ref.current);

    // Монтируем оба экрана в start-позиции
    setSlots([
      { key: from, node: screens[from], role: "exiting", direction },
      { key: to,   node: screens[to],   role: "entering", direction },
    ]);
    setPhase("start");

    // Два RAF: даём браузеру отрисовать start-кадр, затем запускаем transition
    raf1Ref.current = window.requestAnimationFrame(() => {
      raf2Ref.current = window.requestAnimationFrame(() => {
        setPhase("running");

        cleanupRef.current = window.setTimeout(() => {
          setSlots([
            { key: to, node: screens[to], role: "active", direction: "none" },
          ]);
          setPhase("idle");
          cleanupRef.current = null;
        }, DURATION_MS + 40);
      });
    });
  });

  // Обновляем node активного экрана при изменении пропсов (напр. projects)
  useEffect(() => {
    setSlots((prev) =>
      prev.map((s) =>
        s.role === "active" || s.key === screenKey
          ? { ...s, node: screens[s.key] }
          : s,
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      if (cleanupRef.current !== null) window.clearTimeout(cleanupRef.current);
      if (raf1Ref.current !== null) window.cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current !== null) window.cancelAnimationFrame(raf2Ref.current);
    };
  }, []);

  const isAnimating = phase === "start" || phase === "running";

  return (
    <div style={stackStyle}>
      {slots.map((slot) => {
        const { role, direction, key } = slot;
        const isExiting = role === "exiting";
        const isEntering = role === "entering";
        const isActive = role === "active";

        const transform =
          !isAnimating && isActive
            ? "translateX(0)"
            : getTransform(role, direction, phase === "running" ? "running" : "start");

        const transition =
          isAnimating && phase === "running"
            ? `transform ${DURATION_MS}ms ${EASE}`
            : "none";

        // Push: entering (новый) сверху, тень слева от него
        // Pop:  exiting (уходящий) сверху, тень слева от него — открывает нижний экран
        const zIndex = isActive
          ? 2
          : direction === "forward"
          ? (isEntering ? 2 : 1)   // push: новый поверх
          : (isExiting  ? 2 : 1);  // pop:  уходящий поверх

        const boxShadow =
          isAnimating && (
            (isEntering && direction === "forward") ||
            (isExiting  && direction === "backward")
          )
            ? "-10px 0 28px rgba(0,0,0,0.20)"
            : "none";

        return (
          <div
            key={key}
            style={{
              position: "absolute",
              inset: 0,
              zIndex,
              transform,
              transition,
              boxShadow,
              willChange: isAnimating ? "transform" : "auto",
              pointerEvents: isExiting ? "none" : "auto",
            }}
          >
            {slot.node}
          </div>
        );
      })}
    </div>
  );
};

const stackStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

export default ScreenTransition;
