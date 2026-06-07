import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrapTelegramOrientationLock } from "./app/orientationLock";
import { bootstrapTelegramViewport } from "./app/telegramViewport";
import "./index.css";
import "./app/swipeLock.css";

// Язык документа — используется браузером, скринридерами и SEO
document.documentElement.lang = "ru";

// Запускаем Telegram-viewport до первого React-render, чтобы свайп закрытия
// был отключён сразу, а не после первого useEffect.
bootstrapTelegramViewport();

// Фиксируем портретный режим. Если клиент Telegram не поддерживает lockOrientation,
// показываем блокирующий экран в landscape и просим повернуть телефон вертикально.
bootstrapTelegramOrientationLock();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
