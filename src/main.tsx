import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrapTelegramViewport } from "./app/telegramViewport";
import "./index.css";
import "./app/swipeLock.css";

// Запускаем Telegram-viewport до первого React-render, чтобы свайп закрытия
// был отключён сразу, а не после первого useEffect.
bootstrapTelegramViewport();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
