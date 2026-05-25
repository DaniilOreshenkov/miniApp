export {};

declare global {
  type TelegramInset = {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  type TelegramWebAppEvent =
    | "viewportChanged"
    | "safeAreaChanged"
    | "contentSafeAreaChanged"
    | "fullscreenChanged"
    | "fullscreenFailed"
    | "themeChanged"
    | "backButtonClicked";

  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        requestFullscreen?: () => void;
        isVersionAtLeast?: (version: string) => boolean;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        onEvent?: (eventType: TelegramWebAppEvent, eventHandler: (...args: unknown[]) => void) => void;
        offEvent?: (eventType: TelegramWebAppEvent, eventHandler: (...args: unknown[]) => void) => void;
        viewportHeight?: number;
        viewportStableHeight?: number;
        isFullscreen?: boolean;
        platform?: string;
        safeAreaInset?: TelegramInset;
        contentSafeAreaInset?: TelegramInset;
      };
      WebView?: {
        receiveEvent?: (eventType: string, eventData?: unknown) => void;
      };
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
