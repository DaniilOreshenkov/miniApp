/**
 * Global Telegram Mini App types.
 * This file must not contain runtime code.
 */

export {};

declare global {
  type TelegramInset = {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  type TelegramViewportChangedPayload = {
    isStateStable?: boolean;
  };

  type TelegramWebAppEvent =
    | "viewportChanged"
    | "themeChanged"
    | "safeAreaChanged"
    | "contentSafeAreaChanged"
    | "fullscreenChanged"
    | "fullscreenFailed";

  type TelegramWebAppEventHandler = (event?: TelegramViewportChangedPayload) => void;

  type TelegramWebApp = {
    ready?: () => void;
    expand?: () => void;
    close?: () => void;
    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;
    requestFullscreen?: () => void;
    exitFullscreen?: () => void;
    isVersionAtLeast?: (version: string) => boolean;

    viewportHeight?: number;
    viewportStableHeight?: number;
    platform?: string;
    isFullscreen?: boolean;
    isVerticalSwipesEnabled?: boolean;

    safeAreaInset?: TelegramInset;
    contentSafeAreaInset?: TelegramInset;

    onEvent?: (eventType: TelegramWebAppEvent, eventHandler: TelegramWebAppEventHandler) => void;
    offEvent?: (eventType: TelegramWebAppEvent, eventHandler: TelegramWebAppEventHandler) => void;
  };

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
    TelegramWebviewProxy?: {
      postEvent?: (eventType: string, eventData: string) => void;
    };
  }
}
