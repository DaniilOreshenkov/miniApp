import { useEffect, useState, useCallback } from 'react'
import { Crown, Zap, Palette, Download, Check, Loader2, AlertCircle } from 'lucide-react'
import { useTelegram } from '../hooks/useTelegram'

interface SubscriptionStatus {
  active: boolean
  plan?: 'monthly' | 'annual'
  expiresAt?: string
}

interface Plan {
  id: 'monthly' | 'annual'
  label: string
  price: number
  period: string
  badge?: string
  savings?: string
}

const PLANS: Plan[] = [
  {
    id: 'monthly',
    label: 'Месяц',
    price: 299,
    period: '/ месяц',
  },
  {
    id: 'annual',
    label: 'Год',
    price: 1990,
    period: '/ год',
    badge: 'Выгодно',
    savings: 'Экономия 590 ₽',
  },
]

const FEATURES = [
  { icon: Palette, text: 'Все цвета палитры (1000+)' },
  { icon: Zap, text: 'Неограниченные проекты' },
  { icon: Download, text: 'Экспорт схем в PDF и PNG' },
  { icon: Crown, text: 'Приоритетная поддержка' },
]

export function SubscriptionPage() {
  const { userId, initData, ready, openLink, haptic, hapticSuccess } = useTelegram()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ready()
    fetchStatus()
  }, [])

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/subscription?userId=${userId}`, {
        headers: initData ? { 'x-init-data': initData } : {},
      })
      const data = await res.json() as SubscriptionStatus
      setStatus(data)
    } catch {
      setError('Не удалось загрузить статус подписки')
    } finally {
      setLoading(false)
    }
  }, [userId, initData])

  const handleSubscribe = async () => {
    if (paying) return
    haptic('medium')
    setPaying(true)
    setError(null)

    try {
      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(initData ? { 'x-init-data': initData } : {}),
        },
        body: JSON.stringify({ userId, plan: selectedPlan }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Ошибка при создании платежа')
      }

      const { confirmationUrl } = await res.json() as { confirmationUrl: string }
      hapticSuccess()
      openLink(confirmationUrl)

      // Poll for status after returning
      setTimeout(() => {
        void fetchStatus()
      }, 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Что-то пошло не так')
      haptic('heavy')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.centered}>
        <Loader2 size={32} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (status?.active) {
    const expires = status.expiresAt
      ? new Date(status.expiresAt).toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : null

    return (
      <div style={styles.page}>
        <div style={styles.activeBadge}>
          <Crown size={20} color="var(--gold)" />
          <span>Premium активен</span>
        </div>
        {expires && (
          <p style={styles.expiresText}>Действует до {expires}</p>
        )}
        <div style={styles.featureList}>
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} style={styles.featureRow}>
              <div style={styles.featureIcon}><Icon size={16} color="var(--accent)" /></div>
              <span style={styles.featureText}>{text}</span>
              <Check size={16} color="var(--success)" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.crownWrap}>
          <Crown size={32} color="var(--gold)" />
        </div>
        <h1 style={styles.title}>Beadly Premium</h1>
        <p style={styles.subtitle}>Открой все возможности для творчества</p>
      </div>

      {/* Features */}
      <div style={styles.featureList}>
        {FEATURES.map(({ icon: Icon, text }) => (
          <div key={text} style={styles.featureRow}>
            <div style={styles.featureIcon}><Icon size={16} color="var(--accent)" /></div>
            <span style={styles.featureText}>{text}</span>
          </div>
        ))}
      </div>

      {/* Plans */}
      <div style={styles.plans}>
        {PLANS.map((plan) => {
          const selected = selectedPlan === plan.id
          return (
            <button
              key={plan.id}
              style={{ ...styles.planCard, ...(selected ? styles.planCardSelected : {}) }}
              onClick={() => {
                haptic('light')
                setSelectedPlan(plan.id)
              }}
            >
              <div style={styles.planLeft}>
                <span style={styles.planLabel}>{plan.label}</span>
                {plan.savings && (
                  <span style={styles.planSavings}>{plan.savings}</span>
                )}
              </div>
              <div style={styles.planRight}>
                {plan.badge && (
                  <span style={styles.planBadge}>{plan.badge}</span>
                )}
                <span style={styles.planPrice}>{plan.price} ₽</span>
                <span style={styles.planPeriod}>{plan.period}</span>
              </div>
              {selected && (
                <div style={styles.planCheck}>
                  <Check size={14} color="white" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <AlertCircle size={16} color="#f87171" />
          <span>{error}</span>
        </div>
      )}

      {/* CTA */}
      <button
        style={styles.ctaButton}
        onClick={() => { void handleSubscribe() }}
        disabled={paying}
      >
        {paying ? (
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <Crown size={18} />
        )}
        {paying ? 'Открываем оплату...' : 'Оформить подписку'}
      </button>

      <p style={styles.legal}>
        Оплата через ЮKassa. Безопасно и быстро.
      </p>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '20px 16px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 480,
    margin: '0 auto',
    width: '100%',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: '60vh',
  },
  header: {
    textAlign: 'center',
    padding: '8px 0 4px',
  },
  crownWrap: {
    display: 'inline-flex',
    background: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: 'var(--text)',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  featureList: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius)',
    padding: '4px 0',
    border: '1px solid var(--border)',
  },
  featureRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
  },
  featureIcon: {
    width: 32,
    height: 32,
    background: 'var(--accent-glow)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text)',
    flex: 1,
  },
  plans: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  planCard: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    textAlign: 'left',
  },
  planCardSelected: {
    borderColor: 'var(--accent)',
    background: 'rgba(124, 92, 252, 0.08)',
  },
  planLeft: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 2,
  },
  planLabel: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text)',
  },
  planSavings: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--success)',
  },
  planRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  planBadge: {
    fontSize: 11,
    fontWeight: 800,
    background: 'var(--accent)',
    color: 'white',
    padding: '2px 8px',
    borderRadius: 20,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text)',
  },
  planPeriod: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  planCheck: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    background: 'var(--accent)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(248, 113, 113, 0.1)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 14px',
    fontSize: 13,
    color: '#f87171',
    fontWeight: 700,
  },
  ctaButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: 'var(--accent)',
    color: 'white',
    fontSize: 16,
    fontWeight: 800,
    padding: '16px',
    borderRadius: 'var(--radius)',
    width: '100%',
    transition: 'background 0.15s, transform 0.1s',
  },
  activeBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'rgba(245, 158, 11, 0.12)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 'var(--radius)',
    padding: '14px',
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--gold)',
  },
  expiresText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  legal: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
}
