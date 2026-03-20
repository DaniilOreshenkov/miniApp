import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        requestFullscreen?: () => Promise<void> | void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        initData: string;
        initDataUnsafe: {
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
      };
    };
  }
}

type Screen = "home" | "grid";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    const setFallbackHeight = () => {
      const h = window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${h}px`);
      document.body.style.height = `${h}px`;

      const root = document.getElementById("root");
      if (root) {
        root.style.height = `${h}px`;
      }
    };

    const syncTelegramViewportVars = () => {
      const stable = tg?.viewportStableHeight;
      const current = tg?.viewportHeight;

      if (stable && stable > 0) {
        document.documentElement.style.setProperty(
          "--tg-stable-height-fallback",
          `${stable}px`
        );
      }

      if (current && current > 0) {
        document.documentElement.style.setProperty(
          "--tg-height-fallback",
          `${current}px`
        );
      }
    };

    const boot = async () => {
      setFallbackHeight();

      if (!tg) return;

      tg.ready();
      tg.expand();
      tg.setHeaderColor?.("#0c0e12");
      tg.setBackgroundColor?.("#0c0e12");

      syncTelegramViewportVars();

      try {
        await tg.requestFullscreen?.();
      } catch {
        // Не все клиенты Telegram поддерживают fullscreen
      }

      setTimeout(() => {
        setFallbackHeight();
        syncTelegramViewportVars();
      }, 50);

      setTimeout(() => {
        setFallbackHeight();
        syncTelegramViewportVars();
      }, 250);

      setTimeout(() => {
        setFallbackHeight();
        syncTelegramViewportVars();
      }, 700);
    };

    boot();

    const handleResize = () => {
      setFallbackHeight();
      syncTelegramViewportVars();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  if (screen === "grid") {
    return (
      <GridScreen
        width={9}
        height={10}
        wallHeight={3}
        beadSize="2 мм"
        onBack={() => setScreen("home")}
      />
    );
  }

  return <HomeScreen onCreateGrid={() => setScreen("grid")} />;
}