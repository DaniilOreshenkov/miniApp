import { useEffect, useState } from "react";

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
  const [username, setUsername] = useState("guest");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand();

      const user = tg.initDataUnsafe?.user;
      if (user?.username) {
        setUsername(user.username);
      } else if (user?.first_name) {
        setUsername(user.first_name);
      }
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h1>Telegram Mini App</h1>
      <p>Привет, {username}</p>
    </div>
  );
}