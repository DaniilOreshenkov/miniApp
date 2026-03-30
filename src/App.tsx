import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

export type GridSeed = {
  name: string;
  width: number;
  height: number;
};

export type GridData = GridSeed | null;

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
};

function getTG(): TelegramWebApp | undefined {
  return (window as any).Telegram?.WebApp;
}

const DEFAULT_GRID_DATA: GridData = {
  name: "Новый проект",
  width: 10,
  height: 10,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [gridData, setGridData] = useState<GridData | null>(null);

  useEffect(() => {
    const tg = getTG();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    tg?.requestFullscreen?.();

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];

      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);

      const target = e.target as HTMLElement;

      const isScroll = target.closest(".app-scroll");
      const isFixed = target.closest(".app-fixed");

      if (isScroll && dy > dx) {
        return;
      }

      if (isFixed) {
        e.preventDefault();
        return;
      }

      if (dx > dy) {
        e.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, {
      passive: true,
      capture: true,
    });

    document.addEventListener("touchmove", onTouchMove, {
      passive: false,
      capture: true,
    });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
    };
  }, []);

  const openGrid = (data?: GridData) => {
    const nextGridData = data ?? gridData ?? DEFAULT_GRID_DATA;
    setGridData(nextGridData);
    setScreen("grid");
  };

  return (
    <div className="app-shell">
      {screen === "home" ? (
        <HomeScreen onCreateGrid={openGrid} />
      ) : (
        <GridScreen
          data={gridData}
          onBack={() => setScreen("home")}
        />
      )}
    </div>
  );
}