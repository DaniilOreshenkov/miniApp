export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        requestFullscreen?: () => void;
        exitFullscreen?: () => void;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        lockOrientation?: () => void;
        unlockOrientation?: () => void;
        isVersionAtLeast?: (version: string) => boolean;
        onEvent?: (eventType: string, eventHandler: (...args: unknown[]) => void) => void;
        offEvent?: (eventType: string, eventHandler: (...args: unknown[]) => void) => void;
        viewportHeight?: number;
        viewportStableHeight?: number;
        isFullscreen?: boolean;
        isOrientationLocked?: boolean;
        platform?: string;
        safeAreaInset?: {
          top?: number;
          right?: number;
          bottom?: number;
          left?: number;
        };
        contentSafeAreaInset?: {
          top?: number;
          right?: number;
          bottom?: number;
          left?: number;
        };
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
