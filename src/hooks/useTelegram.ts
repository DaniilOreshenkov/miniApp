declare global {
  interface Window {
    Telegram: {
      WebApp: TelegramWebApp
    }
  }
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
    }
  }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  ready(): void
  expand(): void
  close(): void
  openLink(url: string, options?: { try_instant_view?: boolean }): void
  showAlert(message: string, callback?: () => void): void
  showConfirm(message: string, callback: (confirmed: boolean) => void): void
  MainButton: {
    text: string
    isVisible: boolean
    isActive: boolean
    show(): void
    hide(): void
    enable(): void
    disable(): void
    setText(text: string): void
    onClick(fn: () => void): void
    offClick(fn: () => void): void
    showProgress(leaveActive: boolean): void
    hideProgress(): void
  }
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
  }
}

export function useTelegram() {
  const tg = window.Telegram?.WebApp

  const user = tg?.initDataUnsafe?.user
  const userId = user?.id?.toString() ?? 'dev_user'
  const firstName = user?.first_name ?? 'Пользователь'
  const initData = tg?.initData ?? ''

  function ready() {
    tg?.ready()
    tg?.expand()
  }

  function openLink(url: string) {
    tg?.openLink(url, { try_instant_view: false })
  }

  function haptic(style: 'light' | 'medium' | 'heavy' = 'medium') {
    tg?.HapticFeedback?.impactOccurred(style)
  }

  function hapticSuccess() {
    tg?.HapticFeedback?.notificationOccurred('success')
  }

  return { tg, user, userId, firstName, initData, ready, openLink, haptic, hapticSuccess }
}
