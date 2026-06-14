import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSubscription } from '../lib/redis.js'
import { PLANS } from '../lib/yukassa.js'
import { AppError, toErrorResponse, Errors } from '../lib/errors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    const err = Errors.METHOD_NOT_ALLOWED
    return res.status(err.statusCode).json(toErrorResponse(err))
  }

  try {
    const userId = req.query['userId'] as string | undefined

    if (!userId || userId.trim() === '') {
      throw Errors.MISSING_USER_ID
    }

    const sub = await getSubscription(userId)

    if (!sub) {
      return res.status(200).json({
        active: false,
        subscription: null,
        plans: Object.values(PLANS),
      })
    }

    // Проверяем не истекла ли подписка
    const now = new Date()
    const expiresAt = new Date(sub.expiresAt)
    const isExpired = expiresAt <= now

    if (isExpired && sub.status === 'active') {
      // Обновляем статус (lazy expiry)
      sub.status = 'expired'
      // Не ждём — fire & forget, не блокируем ответ
      void import('../lib/redis.js').then(({ setSubscription }) =>
        setSubscription({ ...sub, status: 'expired' }),
      )
    }

    const active = sub.status === 'active' && !isExpired
    const plan = PLANS[sub.plan]

    return res.status(200).json({
      active,
      subscription: {
        plan: sub.plan,
        planLabel: plan?.label ?? sub.plan,
        status: isExpired ? 'expired' : sub.status,
        expiresAt: sub.expiresAt,
        daysLeft: active ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      },
      plans: Object.values(PLANS),
    })
  } catch (err) {
    const errResponse = toErrorResponse(err)
    const statusCode = err instanceof AppError ? err.statusCode : 500
    console.error('[subscription/status] error:', errResponse)
    return res.status(statusCode).json(errResponse)
  }
}
