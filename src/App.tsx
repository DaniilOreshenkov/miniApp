import { useEffect, useRef, useState } from "react";
import HomeScreen from "./screens/HomeScreen";
import GridScreen from "./screens/GridScreen";
import "./index.css";

type Screen = "home" | "grid";

type TelegramBackButton = {
  show?: () => void;
  hide?: () => void;
  onClick?: (callback: () => void) => void;
  offClick?: (callback: () => void) => void;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  BackButton?: TelegramBackButton;
};

function getTelegramWebApp(): TelegramWebApp | undefined {
  return (window as any).Telegram?.WebApp;
}

function setTelegramViewportVars() {
  const tg = getTelegramWebApp();

  const stableHeight =
    tg?.viewportStableHeight ??
    tg?.viewportHeight ??
    window.visualViewport?.height ??
    window.innerHeight;

  const liveHeight =
    tg?.viewportHeight ??
    window.visualViewport?.height ??
    window.innerHeight;

  document.documentElement.style.setProperty(
    "--tg-viewport-stable-height",
    `${stableHeight}px`
  );

  document.documentElement.style.setProperty(
    "--tg-viewport-height",
    `${liveHeight}px`
  );

  document.documentElement.style.setProperty(
    "--app-height",
    `${window.innerHeight}px`
  );
}

function requestTelegramFullscreen() {
  const tg = getTelegramWebApp();

  if (!tg) {
    setTelegramViewportVars();
    return;
  }

  tg.ready?.();
  tg.expand?.();
  tg.disableVerticalSwipes?.();
  tg.requestFullscreen?.();
  setTelegramViewportVars();

  const delays = [50, 150, 300, 700];

  delays.forEach((delay) => {
    setTimeout(() => {
      tg.expand?.();
      tg.disableVerticalSwipes?.();
      tg.requestFullscreen?.();
      setTelegramViewportVars();
    }, delay);
  });
}

function lockDocumentViewport() {
  document.documentElement.style.height =
    "var(--tg-viewport-stable-height, var(--app-height, 100dvh))";
  document.body.style.height =
    "var(--tg-viewport-stable-height, var(--app-height, 100dvh))";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const backHandlerRef = useRef<() => void>(() => {
    setScreen("home");
  });

  useEffect(() => {
    const tg = getTelegramWebApp();

    const refresh = () => {
      requestTelegramFullscreen();
      setTelegramViewportVars();
      lockDocumentViewport();
    };

    refresh();

    const interval = setInterval(refresh, 1200);

    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize",