import { useEffect, useRef, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
  };
};

function getTG(): TelegramWebApp | undefined {
  return (window as any).Telegram?.WebApp;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tg = getTG();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    tg?.requestFullscreen?.();

    // 🔥 ГЛАВНОЕ — ПЕРЕХВАТ НА КОНТЕЙНЕРЕ
    const el = containerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];

      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);

      // 🔥 если горизонталь — УБИВАЕМ
      if (dx > dy) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      tg?.enableVerticalSwipes?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100vh",
        overflow: "hidden",

        // 🔥 КРИТИЧНО
        touchAction: "pan-y",
        overscrollBehavior: "none",

        background: "#0c0e12",
      }}
    >
      {/* 🔥 EDGE BLOCKER (сильнее чем раньше) */}
      <div style={edgeLeft} />
      <div style={edgeRight} />

      {screen === "home" ? (
        <HomeScreen onCreateGrid={() => setScreen("grid")} />
      ) : (
        <GridScreen onBack={() => setScreen("home")} />
      )}
    </div>
  );
}

const edgeLeft: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  bottom: 0,
  width: 32, // 🔥 увеличили
  zIndex: 9999,
  touchAction: "none",
};

const edgeRight: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 32,
  zIndex: 9999,
  touchAction: "none",
};