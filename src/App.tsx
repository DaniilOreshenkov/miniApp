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
      };
    };
  }
}

type Screen = "home" | "grid";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    const setAppHeight = () => {
      const appHeight = window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${appHeight}px`);
      document.body.style.height = `${appHeight}px`;

      const root = document.getElementById("root");
      if (root) {
        root.style.height = `${appHeight}px`;
      }
    };

    const initTelegram = async () => {
      setAppHeight();

      if (!tg) return;

      tg.ready();
      tg.expand();

      // полезно для контраста статус-бара в fullscreen
      tg.setHeaderColor?.("#0c0e12");

      try {
        await tg.requestFullscreen?.();
      } catch (error) {
        console.log("Fullscreen is not available:", error);
      }

      // после expand/fullscreen Telegram может еще раз пересчитать viewport
      setTimeout(setAppHeight, 50);
      setTimeout(setAppHeight, 250);
    };

    initTelegram();

    const handleResize = () => {
      setAppHeight();
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