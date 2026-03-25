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
  tg.disableVerticalSwipes?.();
  tg.requestFullscreen?.();
  setTelegramViewportVars();

  const delays = [50, 150, 300, 700, 1200];

  delays.forEach((delay) => {
    window.setTimeout(() => {
      tg.expand?.();
      tg.disableVerticalSwipes?.();
      tg.requestFullscreen?.();
      setTelegramViewportVars();
    }, delay);
  });
}

function lockDocumentViewport() {
  document.documentElement.style.height =
    "var(--tg-viewport-stable-height, var(--app-height, 100dvh))";
  document.body.style.height =
    "var(--tg-viewport-stable-height, var(--app-height, 100dvh))";
  document.body.style.minHeight =
    "var(--tg-viewport-stable-height, var(--app-height, 100dvh))";
  document.body.style.maxHeight =
    "var(--tg-viewport-stable-height, var(--app-height, 100dvh))";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.overscrollBehavior = "none";
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.overscrollBehavior = "none";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const backHandlerRef = useRef<() => void>(() => {
    setScreen("home");
  });

  useEffect(() => {
    const tg = getTelegramWebApp();

    const refreshLayout = () => {
      requestTelegramFullscreen();
      setTelegramViewportVars();
      lockDocumentViewport();
    };

    const onResize = () => {
      refreshLayout();
    };

    const onFullscreenChanged = () => {
      refreshLayout();
    };

    const onSafeAreaChanged = () => {
      refreshLayout();
    };

    const onVisibilityChanged = () => {
      if (document.visibilityState === "visible") {
        refreshLayout();
      }
    };

    refreshLayout();

    const intervalId = window.setInterval(() => {
      refreshLayout();
    }, 1200);

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChanged);

    tg?.onEvent?.("fullscreenChanged", onFullscreenChanged);
    tg?.onEvent?.("safeAreaChanged", onSafeAreaChanged);
    tg?.onEvent?.("contentSafeAreaChanged", onSafeAreaChanged);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChanged);

      tg?.offEvent?.("fullscreenChanged", onFullscreenChanged);
      tg?.offEvent?.("safeAreaChanged", onSafeAreaChanged);
      tg?.offEvent?.("contentSafeAreaChanged", onSafeAreaChanged);

      tg?.enableVerticalSwipes?.();
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
      className="app-shell"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "var(--tg-viewport-stable-height, var(--app-height, 100dvh))",
        minHeight:
          "var(--tg-viewport-stable-height, var(--app-height, 100dvh))",
        maxHeight:
          "var(--tg-viewport-stable-height, var(--app-height, 100dvh))",
        overflow: "hidden",
        overscrollBehavior: "none",
        touchAction: "none",
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
