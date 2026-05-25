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
    | "safeAreaChanged"
    | "contentSafeAreaChanged"
    | "fullscreenChanged"
    | "fullscreenFailed";

  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        requestFullscreen?: () => void;
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
    };
    TelegramWebviewProxy?: {
      postEvent?: (eventType: string, eventData: string) => void;
    };
  }
}
