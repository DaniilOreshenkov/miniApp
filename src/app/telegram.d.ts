export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
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

        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
      };
    };
    TelegramWebviewProxy?: {
      postEvent?: (eventType: string, eventData: string) => void;
    };
  }
}
