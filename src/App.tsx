import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData: string;
        onEvent?: (eventType: string, handler: () => void) => void;
        offEvent?: (eventType: string, handler: () => void) => void;
        viewportHeight?: number;
        viewportStableHeight?: number;
      };
    };
  }
}

type Screen = "home" | "grid";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    let timeoutId: number | null = null;
    let rafId: number | null = null;

    const setAppHeight = () => {
      const tgHeight = tg?.viewportHeight;
      const tgStableHeight = tg?.viewportStableHeight;
      const vvHeight = window.visualViewport?.height;
      const fallbackHeight = window.innerHeight;

      const appHeight = tgHeight ?? vvHeight ?? fallbackHeight;
      const stableHeight =
        tgStableHeight ?? tgHeight ?? vvHeight ?? fallbackHeight;

      document.documentElement.style.setProperty(
        "--app-height",
        `${Math.round(appHeight)}px`
      );
      document.documentElement.style.setProperty(
        "--tg-stable-height-fallback",
        `${Math.round(stableHeight)}px`
      );
    };

    const scheduleHeightSync = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      rafId = requestAnimationFrame(() => {
        setAppHeight();

        rafId = requestAnimationFrame(() => {
          setAppHeight();
        });
      });

      timeoutId = window.setTimeout(() => {
        setAppHeight();
      }, 300);
    };

    tg?.ready();
    tg?.expand();

    scheduleHeightSync();

    const handleResize = () => {
      scheduleHeightSync();
    };

    const handleViewportChanged = () => {
      scheduleHeightSync();
    };

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    tg?.onEvent?.("viewportChanged", handleViewportChanged);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      tg?.offEvent?.("viewportChanged", handleViewportChanged);
    };
  }, []);

  if (screen === "grid") {
    return <GridScreen onBack={() => setScreen("home")} />;
  }

  return <HomeScreen onCreateGrid={() => setScreen("grid")} />;
}