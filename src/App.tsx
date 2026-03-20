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

type Screen = "home" | "grid";

export default function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>("home");
  const [renderedScreen, setRenderedScreen] = useState<Screen>("home");
  const [stage, setStage] = useState<"idle" | "enter" | "exit">("idle");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const navigateTo = (next: Screen) => {
    if (next === activeScreen) return;

    setStage("exit");

    window.setTimeout(() => {
      setRenderedScreen(next);
      setActiveScreen(next);
      setStage("enter");

      window.setTimeout(() => {
        setStage("idle");
      }, 380);
    }, 220);
  };

  return (
    <div style={appShellStyle}>
      <div
        style={{
          ...screenLayerStyle,
          ...getScreenAnimationStyle(stage),
        }}
      >
        {renderedScreen === "home" ? (
          <HomeScreen onCreateGrid={() => navigateTo("grid")} />
        ) : (
          <GridScreen
            width={9}
            height={10}
            wallHeight={3}
            beadSize="2 мм"
            onBack={() => navigateTo("home")}
          />
        )}
      </div>
    </div>
  );
}

const appShellStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "100vh",
  overflow: "hidden",
  background: "#0c0e12",
};

const screenLayerStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "100vh",
  willChange: "transform, opacity, filter",
};

const getScreenAnimationStyle = (
  stage: "idle" | "enter" | "exit"
): React.CSSProperties => {
  if (stage === "enter") {
    return {
      animation: "appScreenEnter 380ms cubic-bezier(0.22, 1, 0.36, 1)",
    };
  }

  if (stage === "exit") {
    return {
      animation: "appScreenExit 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
    };
  }

  return {};
};

if (typeof document !== "undefined" && !document.getElementById("app-anim-style")) {
  const style = document.createElement("style");
  style.id = "app-anim-style";
  style.innerHTML = `
    @keyframes appScreenEnter {
      0% {
        opacity: 0;
        transform: translateY(22px) scale(0.985);
        filter: blur(10px);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }

    @keyframes appScreenExit {
      0% {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
      100% {
        opacity: 0;
        transform: translateY(-10px) scale(0.992);
        filter: blur(6px);
      }
    }
  `;
  document.head.appendChild(style);
}