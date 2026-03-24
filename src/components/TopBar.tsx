import React from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        close: () => void;
      };
    };
  }
}

type Props = {
  title: string;
  onBack?: () => void;
  onMore?: () => void;
  showBackText?: boolean;
};

export default function TopBar({
  title,
  onBack,
  onMore,
  showBackText = true,
}: Props) {
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    window.Telegram?.WebApp?.close();
  };

  return (
    <div className="topbar">
      <button className="topbar-pill topbar-left" onClick={handleBack}>
        <span className="topbar-icon">✕</span>
        {showBackText && <span className="topbar-text">Закрыть</span>}
      </button>

      <div className="topbar-title">{title}</div>

      <div className="topbar-actions">
        <button className="topbar-circle" aria-label="Свернуть">
          ˅
        </button>
        <button
          className="topbar-circle"
          aria-label="Меню"
          onClick={onMore}
        >
          •••
        </button>
      </div>
    </div>
  );
}