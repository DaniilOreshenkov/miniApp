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

export default function App() {
  const [screen, setScreen] = useState<"home" | "grid">("home");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand();
    }
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