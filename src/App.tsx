import { useEffect, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
};

function getTG(): TelegramWebApp | undefined {
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

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];

      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);

      const target = e.target as HTMLElement;

      const isScroll = target.closest(".app-scroll");
      const isFixed = target.closest(".app-fixed");

      // ✅ если scroll-зона → разрешаем вертикальный скролл
      if (isScroll && dy > dx) {
        return;
      }

      // 🔥 если fixed экран → полностью блокируем все жесты
      if (isFixed) {
        e.preventDefault();
        return;
      }

      // 🔥 в остальных местах → блокируем горизонтальный свайп
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