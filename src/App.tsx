import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData: string;
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
      };
    };
  }
}

type Screen = "home" | "grid";

function setTelegramViewportVars() {
  const tg = window.Telegram?.WebApp;

  const stableHeight =
    tg?.viewportStableHeight ||
    tg?.viewportHeight ||
    window.visualViewport?.height ||
    window.innerHeight;

  const liveHeight =
    tg?.viewportHeight ||
    window.visualViewport?.height ||
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

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();

      setTimeout(() => {
        tg.expand();
        setTelegramViewportVars();
      }, 0);

      setTimeout(() => {
        tg.expand();
        setTelegramViewportVars();
      }, 250);

      setTimeout(() => {
        tg.expand();
        setTelegramViewportVars();
      }, 700);
    } else {
      setTelegramViewportVars();
    }

    const onResize = () => {
      setTelegramViewportVars();
    };

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

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