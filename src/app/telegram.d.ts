export {};

declare global {
  interface TelegramWebApp {
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

    safeAreaInset?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
    contentSafeAreaInset?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };

    onEvent?: (
      eventType:
        | "viewportChanged"
        | "safeAreaChanged"
        | "contentSafeAreaChanged"
        | "fullscreenChanged"
        | "fullscreenFailed",
      eventHandler: () => void,
    ) => void;
    offEvent?: (
      eventType:
        | "viewportChanged"
        | "safeAreaChanged"
        | "contentSafeAreaChanged"
        | "fullscreenChanged"
        | "fullscreenFailed",
      eventHandler: () => void,
    ) => void;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
    TelegramWebviewProxy?: {
      postEvent?: (eventType: string, eventData: string) => void;
    };
  }
}
