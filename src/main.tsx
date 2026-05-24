import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrapTelegramViewport } from "./app/telegramViewport";
import { initAppTouchLock } from "./app/touchLock";
import "./index.css";
import "./app/swipeLock.css";

// Run before first React render: Telegram viewport variables must exist on the first frame.
bootstrapTelegramViewport();
initAppTouchLock();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
