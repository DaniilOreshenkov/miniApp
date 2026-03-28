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

    // 🔥 АНТИ-СВАП (ГЛАВНОЕ)
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

      // 👉 если горизонтальный свайп → блокируем
      if (diffX > diffY) {
        e.preventDefault();
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
        touchAction: "pan-y", // 🔥 важно
        background: "#0c0e12",
      }}
    >
      {screen === "home" ? (
        <HomeScreen onCreateGrid={() => setScreen("grid")} />
      ) : (
        <GridScreen onBack={() => setScreen("home")} />
      )}
    </div>
  );
}