import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPayment, getPlan, PLANS } from '../lib/yukassa.js'
import { setPayment } from '../lib/redis.js'
import { AppError, toErrorResponse, Errors } from '../lib/errors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS для Telegram Mini App
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    const err = Errors.METHOD_NOT_ALLOWED
    return res.status(err.statusCode).json(toErrorResponse(err))
  }

  try {
    // ── Валидация входа ─────────────────────────────────────────────────────
    const { userId, planId } = req.body as { userId?: string; planId?: string }

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw Errors.MISSING_USER_ID
    }

    if (!planId || typeof planId !== 'string') {
      throw Errors.MISSING_PLAN
    }

    const plan = getPlan(planId) // бросит INVALID_PLAN если план не существует

    // ── Уникальный ключ идемпотентности ────────────────────────────────────
    const idempotencyKey = `${userId}-${planId}-${Date.now()}`

    // ── Формируем return_url ────────────────────────────────────────────────
    const appUrl = process.env.VITE_APP_URL ?? `https://${req.headers.host}`
    const returnUrl = `${appUrl}?payment=success&userId=${encodeURIComponent(userId)}`

    // ── Создаём платёж в ЮКассе ────────────────────────────────────────────
    const { paymentId, confirmationUrl } = await createPayment({
      userId,
      plan,
      idempotencyKey,
      returnUrl,
    })

    // ── Сохраняем запись о платеже в Redis ─────────────────────────────────
    await setPayment(paymentId, {
      userId,
      plan: planId,
      amount: plan.amount,
      currency: plan.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    return res.status(200).json({
      paymentId,
      confirmationUrl,
      plan: {
        id: plan.id,
        label: plan.label,
        amount: plan.amount,
        currency: plan.currency,
      },
    })
  } catch (err) {
    const errResponse = toErrorResponse(err)
    const statusCode = err instanceof AppError ? err.statusCode : 500
    console.error('[payments/create] error:', errResponse)
    return res.status(statusCode).json(errResponse)
  }
}

// Экспортируем планы для фронтенда (GET /api/payments/plans)
export { PLANS }
