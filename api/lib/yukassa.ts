import { AppError } from './errors.js'
import type { PlanId } from './redis.js'

// ── Планы ────────────────────────────────────────────────────────────────────

export interface Plan {
  id: PlanId
  label: string
  /** Дней в оплаченном периоде */
  periodDays: number
  /** Полная цена за период (₽) */
  price: number
  /** Первый платёж для активации пробного периода (₽) */
  trialAmount: number
  /** Дней пробного периода */
  trialDays: number
}

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: 'monthly',
    label: 'Студия (месяц)',
    periodDays: 30,
    price: 349,
    trialAmount: 1,
    trialDays: 3,
  },
  pro: {
    id: 'pro',
    label: 'Студия (год)',
    periodDays: 365,
    price: 2990,
    trialAmount: 1,
    trialDays: 3,
  },
}

export function getPlan(planId: string): Plan {
  const plan = PLANS[planId as PlanId]
  if (!plan) {
    throw new AppError('INVALID_PLAN', `Недопустимый план: ${planId}`, 400)
  }
  return plan
}

// ── ЮКасса API ────────────────────────────────────────────────────────────────

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = process.env.YUKASSA_SHOP_ID
  const secretKey = process.env.YUKASSA_SECRET_KEY
  if (!shopId || !secretKey) {
    throw new AppError('YUKASSA_CONFIG_MISSING', 'YUKASSA_SHOP_ID и YUKASSA_SECRET_KEY не заданы', 503)
  }
  return { shopId, secretKey }
}

function authHeader(): string {
  const { shopId, secretKey } = getCredentials()
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`
}

interface YKPaymentResponse {
  id: string
  status: string
  paid: boolean
  amount: { value: string; currency: string }
  confirmation?: { type: string; confirmation_url: string }
  payment_method?: {
    id: string
    type: string
    saved: boolean
  }
}

interface YKError {
  type: string
  code: string
  description: string
}

async function ykFetch<T>(
  path: string,
  opts: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...rest } = opts
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader(),
  }
  if (idempotencyKey) headers['Idempotence-Key'] = idempotencyKey

  let res: Response
  try {
    res = await fetch(`https://api.yookassa.ru/v3${path}`, { ...rest, headers })
  } catch (err) {
    throw new AppError(
      'YUKASSA_NETWORK',
      `Сетевая ошибка ЮКассы: ${err instanceof Error ? err.message : String(err)}`,
      502,
    )
  }

  if (!res.ok) {
    let ykErr: YKError | null = null
    try { ykErr = (await res.json()) as YKError } catch { /* ignore */ }
    throw new AppError('YUKASSA_API_ERROR', ykErr?.description ?? `ЮКасса: HTTP ${res.status}`, 502)
  }

  return res.json() as Promise<T>
}

// ── Создать первый платёж (с сохранением метода оплаты) ────────────────────

export async function createFirstPayment(params: {
  userId: string
  plan: Plan
  returnUrl: string
  idempotencyKey: string
}): Promise<{ paymentId: string; confirmationUrl: string }> {
  const { userId, plan, returnUrl, idempotencyKey } = params

  const data = await ykFetch<YKPaymentResponse>('/payments', {
    method: 'POST',
    idempotencyKey,
    body: JSON.stringify({
      amount: { value: plan.trialAmount.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      save_payment_method: true,
      description: `Beadly ${plan.label} — пробный период ${plan.trialDays} дня`,
      metadata: { userId, planId: plan.id },
    }),
  })

  if (!data.confirmation?.confirmation_url) {
    throw new AppError('YUKASSA_NO_URL', 'ЮКасса не вернула ссылку для оплаты', 502)
  }

  return { paymentId: data.id, confirmationUrl: data.confirmation.confirmation_url }
}

// ── Рекуррентный платёж (без подтверждения пользователя) ───────────────────

export async function chargeRecurring(params: {
  userId: string
  plan: Plan
  paymentMethodId: string
  idempotencyKey: string
}): Promise<{ paymentId: string; status: string }> {
  const { userId, plan, paymentMethodId, idempotencyKey } = params

  const data = await ykFetch<YKPaymentResponse>('/payments', {
    method: 'POST',
    idempotencyKey,
    body: JSON.stringify({
      amount: { value: plan.price.toFixed(2), currency: 'RUB' },
      capture: true,
      payment_method_id: paymentMethodId,
      description: `Beadly ${plan.label} — автопродление`,
      metadata: { userId, planId: plan.id },
    }),
  })

  return { paymentId: data.id, status: data.status }
}

// ── Вебхук ────────────────────────────────────────────────────────────────────

export interface YKWebhookEvent {
  type: 'notification'
  event: 'payment.succeeded' | 'payment.canceled' | 'payment.waiting_for_capture' | 'refund.succeeded'
  object: {
    id: string
    status: string
    paid: boolean
    amount: { value: string; currency: string }
    metadata: { userId: string; planId: string }
    payment_method?: {
      id: string
      type: string
      saved: boolean
    }
  }
}

export function verifyWebhookSecret(query: string | undefined): void {
  const expected = process.env.WEBHOOK_SECRET
  if (!expected) return // в проде всегда задавать!
  if (query !== expected) {
    throw new AppError('WEBHOOK_INVALID_SECRET', 'Неверный секрет вебхука', 401)
  }
}
