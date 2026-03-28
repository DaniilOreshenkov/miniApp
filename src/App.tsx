import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

function getTG() {
  return (window as any).Telegram?.WebApp;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    const tg = getTG();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    tg?.requestFullscreen?.();

    // ❗ блокируем свайп только вне scroll
    const preventTouch = (e: TouchEvent) => {
      const target = e.target as HTMLElement;

      if (target.closest(".app-scroll")) return;

      e.preventDefault();
    };

    document.addEventListener("touchmove", preventTouch, {
      passive: false,
    });

    return () => {
      document.removeEventListener("touchmove", preventTouch);
    };
  }, []);

  return (
    <div className="app-shell">
      {screen === "home" ? (
        <HomeScreen onCreateGrid={() => setScreen("grid")} />
      ) : (
        <GridScreen onBack={() => setScreen("home")} />
      )}
    </div>
  );
}