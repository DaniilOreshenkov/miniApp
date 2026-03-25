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
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
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
  isFullscreen?: boolean;
  safeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
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

  const safeTop = tg?.contentSafeAreaInset?.top ?? tg?.safeAreaInset?.top ?? 0;
  const safeBottom =
    tg?.contentSafeAreaInset?.bottom ?? tg?.safeAreaInset?.bottom ?? 0;

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

  document.documentElement.style.setProperty("--tg-safe-top", `${safeTop}px`);
  document.documentElement.style.setProperty(
    "--tg-safe-bottom",
    `${safeBottom}px`
  );
}

function requestTelegramFullscreen() {
  const tg = getTelegramWebApp();

  if (!tg) {
    setTelegramViewportVars();
    return;
  }

  tg.ready?.();
  tg.expand?.();
  tg.requestFullscreen?.();

  setTelegramViewportVars();

  setTimeout(() => {
    tg.expand?.();
    tg.requestFullscreen?.();
    setTelegramViewportVars();
  }, 50);

  setTimeout(() => {
    tg.expand?.();
    tg.requestFullscreen?.();
    setTelegramViewportVars();
  }, 250);

  setTimeout(() => {
    tg.expand?.();
    tg.requestFullscreen?.();
    setTelegramViewportVars();
  }, 700);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const backHandlerRef = useRef<() => void>(() => {
    setScreen("home");
  });

  useEffect(() => {
    const tg = getTelegramWebApp();

    requestTelegramFullscreen();
    tg?.disableVerticalSwipes?.();

    const onResize = () => {
      setTelegramViewportVars();
    };

    const onFullscreenChanged = () => {
      setTelegramViewportVars();
    };

    const onSafeAreaChanged = () => {
      setTelegramViewportVars();
    };

    setTelegramViewportVars();

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    tg?.onEvent?.("fullscreenChanged", onFullscreenChanged);
    tg?.onEvent?.("safeAreaChanged", onSafeAreaChanged);
    tg?.onEvent?.("contentSafeAreaChanged", onSafeAreaChanged);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);

      tg?.offEvent?.("fullscreenChanged", onFullscreenChanged);
      tg?.offEvent?.("safeAreaChanged", onSafeAreaChanged);
      tg?.offEvent?.("contentSafeAreaChanged", onSafeAreaChanged);
      tg?.enableVerticalSwipes?.();
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
        height: "var(--tg-viewport-stable-height, var(--app-height, 100dvh))",
        minHeight:
          "var(--tg-viewport-stable-height, var(--app-height, 100dvh))",
        maxHeight:
          "var(--tg-viewport-stable-height, var(--app-height, 100dvh))",
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