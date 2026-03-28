import { useEffect, useRef, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

type TelegramBackButton = {
  show?: () => void;
  hide?: () => void;
  onClick?: (callback: () => void) => void;
  offClick?: (callback: () => void) => void;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  BackButton?: TelegramBackButton;
};

function getTelegramWebApp(): TelegramWebApp | undefined {
  return (window as any).Telegram?.WebApp;
}

function setViewportVars() {
  const tg = getTelegramWebApp();

  const height =
    tg?.viewportStableHeight ||
    tg?.viewportHeight ||
    window.innerHeight;

  document.documentElement.style.setProperty(
    "--tg-viewport-stable-height",
    `${height}px`
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const backHandlerRef = useRef(() => setScreen("home"));

  useEffect(() => {
    const tg = getTelegramWebApp();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    tg?.requestFullscreen?.();

    setViewportVars();

    const interval = setInterval(() => {
      tg?.expand?.();
      setViewportVars();
    }, 1000);

    // 🔥 ПОЛНЫЙ АНТИ-СВАП
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const t = e.touches[0];
      const diffX = Math.abs(t.clientX - startX);
      const diffY = Math.abs(t.clientY - startY);

      if (diffX > diffY) {
        e.preventDefault(); // 🔥 блокируем горизонталь
      }
    };

    document.addEventListener("touchstart", onTouchStart, {
      passive: false,
    });

    document.addEventListener("touchmove", onTouchMove, {
      passive: false,
    });

    return () => {
      clearInterval(interval);
      tg?.enableVerticalSwipes?.();

      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;

    const handleBack = () => {
      backHandlerRef.current();
    };

    if (!backButton) return;

    if (screen === "grid") {
      backButton.show?.();
      backButton.onClick?.(handleBack);
    } else {
      backButton.hide?.();
      backButton.offClick?.(handleBack);
    }

    return () => {
      backButton.offClick?.(handleBack);
    };
  }, [screen]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "var(--tg-viewport-stable-height, 100vh)",
        overflow: "hidden",
        overscrollBehavior: "none",
        touchAction: "pan-y",
        background: "#0c0e12",
      }}
    >
      {/* 🔥 ЛЕВЫЙ ЩИТ (убивает edge swipe) */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: 24,
          zIndex: 9999,
          touchAction: "none",
        }}
      />

      {/* 🔥 ПРАВЫЙ ЩИТ */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 24,
          zIndex: 9999,
          touchAction: "none",
        }}
      />

      {screen === "home" ? (
        <HomeScreen onCreateGrid={() => setScreen("grid")} />
      ) : (
        <GridScreen onBack={() => setScreen("home")} />
      )}
    </div>
  );
}