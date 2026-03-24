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

    (
      window as Window & {
        Telegram?: {
          WebApp?: {
            close?: () => void;
          };
        };
      }
    ).Telegram?.WebApp?.close?.();
  };

  return (
    <div className="topbar">
      <button
        type="button"
        className="topbar-pill topbar-left"
        onClick={handleBack}
      >
        <span className="topbar-icon">✕</span>
        {showBackText && <span className="topbar-text">Закрыть</span>}
      </button>

      <div className="topbar-title">{title}</div>

      <div className="topbar-actions">
        <button type="button" className="topbar-circle" aria-label="Свернуть">
          ˅
        </button>

        <button
          type="button"
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