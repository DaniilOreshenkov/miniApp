import { useState, useEffect, useCallback } from 'react'
import type {
  SubscriptionStatusResponse,
  CreatePaymentResponse,
  ApiError,
} from '../types/subscription.js'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

type LoadingState = 'idle' | 'loading' | 'paying'

interface UseSubscriptionReturn {
  data: SubscriptionStatusResponse | null
  loading: LoadingState
  error: string | null
  refetch: () => Promise<void>
  purchase: (planId: string) => Promise<void>
}

export function useSubscription(userId: string | null): UseSubscriptionReturn {
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null)
  const [loading, setLoading] = useState<LoadingState>('idle')
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!userId) return
    setLoading('loading')
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/api/subscription/status?userId=${encodeURIComponent(userId)}`)
      const json = (await res.json()) as SubscriptionStatusResponse | ApiError

      if (!res.ok) {
        throw new Error((json as ApiError).message ?? `HTTP ${res.status}`)
      }

      setData(json as SubscriptionStatusResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setLoading('idle')
    }
  }, [userId])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // После возврата из ЮКассы — автообновление статуса
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      // Даём время вебхуку обработаться, затем обновляем
      const timer = setTimeout(() => void fetchStatus(), 2000)
      // Убираем параметр из URL
      const url = new URL(window.location.href)
      url.searchParams.delete('payment')
      window.history.replaceState({}, '', url.toString())
      return () => clearTimeout(timer)
    }
  }, [fetchStatus])

  const purchase = useCallback(
    async (planId: string) => {
      if (!userId) return
      setLoading('paying')
      setError(null)

      try {
        const res = await fetch(`${API_BASE}/api/payments/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, planId }),
        })

        const json = (await res.json()) as CreatePaymentResponse | ApiError

        if (!res.ok) {
          throw new Error((json as ApiError).message ?? `HTTP ${res.status}`)
        }

        const { confirmationUrl } = json as CreatePaymentResponse

        // Открываем страницу оплаты ЮКассы
        const tgApp = window.Telegram?.WebApp as { openLink?: (url: string) => void } | undefined
        if (tgApp?.openLink) {
          tgApp.openLink(confirmationUrl)
        } else {
          window.location.href = confirmationUrl
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка оплаты')
      } finally {
        setLoading('idle')
      }
    },
    [userId],
  )

  return { data, loading, error, refetch: fetchStatus, purchase }
}
