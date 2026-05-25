export {};

declare global {
  type TelegramInset = {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  type TelegramWebAppEvent =
    | "themeChanged"
    | "viewportChanged"
    | "safeAreaChanged"
    | "contentSafeAreaChanged"
    | "fullscreenChanged"
    | "fullscreenFailed"
    | "backButtonClicked"
    | "mainButtonClicked";

  interface TelegramWebApp {
    ready?: () => void;
    expand?: () => void;
    close?: () => void;
    requestFullscreen?: () => void;
    exitFullscreen?: () => void;
    isVersionAtLeast?: (version: string) => boolean;
    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;
    onEvent?: (eventType: TelegramWebAppEvent, eventHandler: (...args: unknown[]) => void) => void;
    offEvent?: (eventType: TelegramWebAppEvent, eventHandler: (...args: unknown[]) => void) => void;
    viewportHeight?: number;
    viewportStableHeight?: number;
    isFullscreen?: boolean;
    platform?: string;
    colorScheme?: "light" | "dark";
    safeAreaInset?: TelegramInset;
    contentSafeAreaInset?: TelegramInset;
    BackButton?: {
      show?: () => void;
      hide?: () => void;
      onClick?: (callback: () => void) => void;
      offClick?: (callback: () => void) => void;
    };
    HapticFeedback?: {
      impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
      notificationOccurred?: (type: "error" | "success" | "warning") => void;
      selectionChanged?: () => void;
    };
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
    TelegramWebviewProxy?: {
      postEvent?: (eventType: string, eventData: string) => void;
    };
    webkit?: {
      messageHandlers?: {
        TelegramWebviewProxy?: {
          postMessage?: (message: string) => void;
        };
      };
    };
  }
}
