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

    // ✅ если это scroll зона — разрешаем вертикальный
    if (target.closest(".app-scroll")) {
      if (dy > dx) return;
    }

    // ❌ если горизонтальный свайп — блокируем
    if (dx > dy) {
      e.preventDefault();
    }
  };

  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
  });

  document.addEventListener("touchmove", onTouchMove, {
    passive: false,
  });

  return () => {
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchmove", onTouchMove);
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