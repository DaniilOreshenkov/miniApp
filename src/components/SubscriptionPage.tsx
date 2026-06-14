import { Crown, CheckCircle2, Clock, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import type { Plan, SubscriptionInfo } from '../types/subscription.js'

interface ActiveSubscriptionProps {
  subscription: SubscriptionInfo
  onRefetch: () => void
  loading: boolean
}

function ActiveSubscription({ subscription, onRefetch, loading }: ActiveSubscriptionProps) {
  const expiresDate = new Date(subscription.expiresAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="active-sub">
      <div className="active-sub__badge">
        <Crown size={20} />
        <span>Premium активен</span>
      </div>
      <div className="active-sub__info">
        <div className="active-sub__row">
          <CheckCircle2 size={16} className="icon-green" />
          <span>Тариф: <strong>{subscription.planLabel}</strong></span>
        </div>
        <div className="active-sub__row">
          <Clock size={16} className="icon-yellow" />
          <span>Действует до: <strong>{expiresDate}</strong></span>
        </div>
        <div className="active-sub__row">
          <Clock size={16} className="icon-blue" />
          <span>Осталось дней: <strong>{subscription.daysLeft}</strong></span>
        </div>
      </div>
      <button
        className="btn btn--ghost btn--sm"
        onClick={onRefetch}
        disabled={loading}
      >
        <RefreshCw size={14} className={loading ? 'spin' : ''} />
        Обновить статус
      </button>
    </div>
  )
}

interface PlanCardProps {
  plan: Plan
  onPurchase: (planId: string) => void
  loading: boolean
  recommended?: boolean
}

function PlanCard({ plan, onPurchase, loading, recommended }: PlanCardProps) {
  const pricePerMonth =
    plan.durationDays >= 30
      ? Math.round((plan.amount / plan.durationDays) * 30)
      : plan.amount

  const originalMonthly = 149

  const savings =
    plan.durationDays > 30
      ? Math.round(originalMonthly * (plan.durationDays / 30)) - plan.amount
      : 0

  return (
    <div className={`plan-card ${recommended ? 'plan-card--recommended' : ''}`}>
      {recommended && <div className="plan-card__badge">Выгоднее всего</div>}
      <div className="plan-card__header">
        <span className="plan-card__label">{plan.label}</span>
        {savings > 0 && (
          <span className="plan-card__savings">−{savings} ₽</span>
        )}
      </div>
      <div className="plan-card__pricing">
        <span className="plan-card__price">{plan.amount} ₽</span>
        {plan.durationDays > 30 && (
          <span className="plan-card__per-month">{pricePerMonth} ₽/мес</span>
        )}
      </div>
      <button
        className="btn btn--primary"
        onClick={() => onPurchase(plan.id)}
        disabled={loading}
      >
        {loading ? <Loader2 size={16} className="spin" /> : 'Оформить'}
      </button>
    </div>
  )
}

interface SubscriptionPageProps {
  plans: Plan[]
  subscription: SubscriptionInfo | null
  active: boolean
  loading: 'idle' | 'loading' | 'paying'
  error: string | null
  onPurchase: (planId: string) => void
  onRefetch: () => void
}

export function SubscriptionPage({
  plans,
  subscription,
  active,
  loading,
  error,
  onPurchase,
  onRefetch,
}: SubscriptionPageProps) {
  if (loading === 'loading') {
    return (
      <div className="page-center">
        <Loader2 size={32} className="spin" />
        <p className="text-muted">Загрузка...</p>
      </div>
    )
  }

  return (
    <div className="subscription-page">
      <div className="subscription-page__header">
        <Crown size={28} className="icon-gold" />
        <h1>Beadly Premium</h1>
        <p className="text-muted">Неограниченный доступ ко всем функциям</p>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {active && subscription ? (
        <ActiveSubscription
          subscription={subscription}
          onRefetch={onRefetch}
          loading={loading === 'loading'}
        />
      ) : (
        <>
          <div className="features-list">
            {[
              'Неограниченное количество схем',
              'Экспорт в PDF и PNG',
              'Все форматы бисера',
              'Приоритетная поддержка',
            ].map((f) => (
              <div key={f} className="features-list__item">
                <CheckCircle2 size={16} className="icon-green" />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="plans-grid">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onPurchase={onPurchase}
                loading={loading === 'paying'}
                recommended={plan.id === 'month_12'}
              />
            ))}
          </div>

          {loading === 'paying' && (
            <p className="text-muted text-center">Открываем страницу оплаты...</p>
          )}
        </>
      )}
    </div>
  )
}
