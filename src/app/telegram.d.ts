/**
 * Глобальные типы Telegram Mini App.
 *
 * В этом файле не должно быть runtime-кода: .d.ts используется только
 * TypeScript-компилятором. Вся логика viewport/safe-area находится в
 * app/telegramViewport.ts.
 */

export {};

declare global {
  type TelegramInset = {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };

  type TelegramWebAppEvent =
    | "viewportChanged"
    | "themeChanged"
    | "safeAreaChanged"
    | "contentSafeAreaChanged"
    | "fullscreenChanged"
    | "fullscreenFailed";

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

    onEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
    offEvent?: (eventType: TelegramWebAppEvent, eventHandler: () => void) => void;
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
