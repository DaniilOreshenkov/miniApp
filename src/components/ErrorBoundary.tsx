import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — предотвращает белый экран при падении дочернего компонента.
 * Особенно важно для Telegram WebView, где нет DevTools и пользователь
 * видит пустой экран без возможности восстановиться.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={iconStyle}>⚠️</div>
            <div style={titleStyle}>Что-то пошло не так</div>
            <div style={messageStyle}>
              {this.state.error?.message ?? "Неизвестная ошибка"}
            </div>
            <button type="button" style={buttonStyle} onClick={this.handleReset}>
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "var(--bg, #0b0e14)",
  zIndex: 99999,
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 340,
  padding: "28px 24px",
  borderRadius: 24,
  background: "var(--surface-strong, #151820)",
  border: "1px solid var(--border, rgba(255,255,255,0.08))",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  textAlign: "center",
};

const iconStyle: React.CSSProperties = {
  fontSize: 40,
  lineHeight: 1,
};

const titleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "var(--text-primary, #f7f7fb)",
};

const messageStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-tertiary, rgba(247,247,251,0.56))",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  height: 44,
  padding: "0 24px",
  borderRadius: 14,
  border: "none",
  background: "var(--primary-button-bg, linear-gradient(135deg,#8260f2,#6e4fd7))",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "none",
};
