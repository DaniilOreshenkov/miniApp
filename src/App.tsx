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
  const tg = (window as any).Telegram?.WebApp;

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

    const isHorizontal = dx > dy;

    // 🔥 КЛЮЧ: блокируем горизонтальный свайп ВЕЗДЕ
    if (isHorizontal) {
      e.preventDefault();
    }
  };

  // ❗ capture = true — перехватываем ДО Telegram
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