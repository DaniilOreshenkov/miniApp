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
  const [viewportTick, setViewportTick] = useState(0);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    let timeoutId: number | null = null;
    let raf1: number | null = null;
    let raf2: number | null = null;

    const setAppHeight = () => {
      const tgHeight = tg?.viewportHeight;
      const tgStableHeight = tg?.viewportStableHeight;
      const vvHeight = window.visualViewport?.height;
      const fallbackHeight = window.innerHeight;

      const appHeight =
        tgStableHeight ?? tgHeight ?? vvHeight ?? fallbackHeight;

      document.documentElement.style.setProperty(
        "--app-height",
        `${Math.round(appHeight)}px`
      );
    };

    const syncViewport = () => {
      setAppHeight();
      setViewportTick((prev) => prev + 1);
    };

    const scheduleSync = () => {
      if (raf1 !== null) cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
      if (timeoutId !== null) window.clearTimeout(timeoutId);

      raf1 = requestAnimationFrame(() => {
        syncViewport();

        raf2 = requestAnimationFrame(() => {
          syncViewport();
        });
      });

      timeoutId = window.setTimeout(() => {
        syncViewport();
      }, 320);
    };

    tg?.ready();
    tg?.expand();

    scheduleSync();

    const handleResize = () => {
      scheduleSync();
    };

    const handleViewportChanged = () => {
      scheduleSync();
    };

    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    tg?.onEvent?.("viewportChanged", handleViewportChanged);

    return () => {
      if (raf1 !== null) cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
      if (timeoutId !== null) window.clearTimeout(timeoutId);

      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      tg?.offEvent?.("viewportChanged", handleViewportChanged);
    };
  }, []);

  if (screen === "grid") {
    return (
      <GridScreen
        key={`grid-${viewportTick}`}
        onBack={() => setScreen("home")}
      />
    );
  }

  return (
    <HomeScreen
      key={`home-${viewportTick}`}
      onCreateGrid={() => setScreen("grid")}
    />
  );
}