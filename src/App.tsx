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
  close?: () => void;
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  viewportHeight?: number;
  viewportStableHeight?: number;
  BackButton?: TelegramBackButton;
};

function getTelegramWebApp(): TelegramWebApp | undefined {
  return (
    window as Window & {
      Telegram?: {
        WebApp?: TelegramWebApp;
      };
    }
  ).Telegram?.WebApp;
}

function setTelegramViewportVars() {
  const tg = getTelegramWebApp();

  const stableHeight =
    tg?.viewportStableHeight ??
    tg?.viewportHeight ??
    window.visualViewport?.height ??
    window.innerHeight;

  const liveHeight =
    tg?.viewportHeight ??
    window.visualViewport?.height ??
    window.innerHeight;

  document.documentElement.style.setProperty(
    "--tg-viewport-stable-height",
    `${stableHeight}px`
  );

  document.documentElement.style.setProperty(
    "--tg-viewport-height",
    `${liveHeight}px`
  );

  document.documentElement.style.setProperty(
    "--app-height",
    `${window.innerHeight}px`
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const backHandlerRef = useRef<() => void>(() => {
    setScreen("home");
  });

  useEffect(() => {
    const tg = getTelegramWebApp();

    if (tg) {
      tg.ready?.();

      setTimeout(() => {
        tg.expand?.();
        setTelegramViewportVars();
      }, 0);

      setTimeout(() => {
        tg.expand?.();
        setTelegramViewportVars();
      }, 150);

      setTimeout(() => {
        tg.expand?.();
        setTelegramViewportVars();
      }, 400);

      setTimeout(() => {
        tg.expand?.();
        setTelegramViewportVars();
      }, 800);
    } else {
      setTelegramViewportVars();
    }

    const onResize = () => {
      setTelegramViewportVars();
    };

    setTelegramViewportVars();

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;
    const handleBack = backHandlerRef.current;

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
      className="app-shell"
      style={{
        width: "100%",
        height: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
        minHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
        maxHeight: "var(--tg-viewport-stable-height, var(--app-height, 100vh))",
        overflow: "hidden",
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