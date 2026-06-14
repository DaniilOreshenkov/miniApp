import { Redis } from '@upstash/redis'
import { AppError } from './errors.js'

// Singleton Redis client
let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    throw new AppError(
      'REDIS_CONFIG_MISSING',
      'UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN должны быть заданы',
      503,
    )
  }

  _redis = new Redis({ url, token })
  return _redis
}

// ── Типы ─────────────────────────────────────────────────────────────────────

export type SubStatus = 'trial' | 'active' | 'cancelled' | 'expired'
export type PlanId = 'monthly' | 'pro'

export interface Subscription {
  userId: string
  planId: PlanId
  status: SubStatus
  /** Конец пробного периода (ms), null если пробный уже закончился или не было */
  trialEndsAt: number | null
  /** Конец текущего оплаченного периода (ms) */
  periodEndsAt: number
  /** = periodEndsAt, когда произойдёт следующее автосписание */
  nextChargeAt: number
  /** ID сохранённого метода оплаты ЮКассы для рекуррентных платежей */
  paymentMethodId: string | null
  autoRenewal: boolean
  createdAt: number
}

export type PaymentStatus = 'pending' | 'succeeded' | 'cancelled' | 'failed'

export interface PaymentRecord {
  userId: string
  planId: PlanId
  amount: number
  currency: string
  status: PaymentStatus
  createdAt: number
}

// ── Ключи ─────────────────────────────────────────────────────────────────────

const KEY = {
  sub: (userId: string) => `sub:${userId}`,
  payment: (paymentId: string) => `payment:${paymentId}`,
}

// ── Операции ──────────────────────────────────────────────────────────────────

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const redis = getRedis()
  const data = await redis.get<Subscription>(KEY.sub(userId))
  return data ?? null
}

export async function setSubscription(sub: Subscription): Promise<void> {
  const redis = getRedis()
  // TTL: 400 дней (запас после годовой подписки)
  await redis.set(KEY.sub(sub.userId), sub, { ex: 60 * 60 * 24 * 400 })
}

export async function getPayment(paymentId: string): Promise<PaymentRecord | null> {
  const redis = getRedis()
  const data = await redis.get<PaymentRecord>(KEY.payment(paymentId))
  return data ?? null
}

export async function setPayment(paymentId: string, record: PaymentRecord): Promise<void> {
  const redis = getRedis()
  await redis.set(KEY.payment(paymentId), record, { ex: 60 * 60 * 24 * 90 })
}
