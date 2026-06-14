import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyWebhookSecret, getPlan, type YuKassaWebhookEvent } from '../lib/yukassa.js'
import { getPayment, setPayment, setSubscription } from '../lib/redis.js'
import { AppError, toErrorResponse, Errors } from '../lib/errors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    const err = Errors.METHOD_NOT_ALLOWED
    return res.status(err.statusCode).json(toErrorResponse(err))
  }

  try {
    // ── Проверка секрета ────────────────────────────────────────────────────
    const secret = req.query['secret'] as string | undefined
    verifyWebhookSecret(secret)

    // ── Парсинг тела ────────────────────────────────────────────────────────
    const event = req.body as YuKassaWebhookEvent | undefined

    if (!event || event.type !== 'notification' || !event.object?.id) {
      throw Errors.WEBHOOK_INVALID_BODY
    }

    const { object } = event
    const paymentId = object.id

    console.log(`[webhook] event=${event.event} paymentId=${paymentId} status=${object.status}`)

    // ── Обработка событий ───────────────────────────────────────────────────
    if (event.event === 'payment.succeeded' && object.paid) {
      await handlePaymentSucceeded(paymentId, object)
    } else if (event.event === 'payment.canceled') {
      await handlePaymentCancelled(paymentId)
    }
    // Остальные события (waiting_for_capture, refund.succeeded) — игнорируем

    // ЮКасса требует 200 OK, иначе будет повторять вебхук
    return res.status(200).json({ ok: true })
  } catch (err) {
    const errResponse = toErrorResponse(err)
    const statusCode = err instanceof AppError ? err.statusCode : 500
    console.error('[webhook] error:', errResponse)
    // Возвращаем 200 чтобы ЮКасса не повторяла вебхук при ошибках бизнес-логики
    // Для ошибок авторизации возвращаем реальный статус
    const responseStatus = err instanceof AppError && err.statusCode === 401 ? 401 : 200
    return res.status(responseStatus).json(errResponse)
  }
}

async function handlePaymentSucceeded(
  paymentId: string,
  object: YuKassaWebhookEvent['object'],
): Promise<void> {
  // Получаем запись о платеже из Redis
  const payment = await getPayment(paymentId)

  let userId: string
  let planId: string

  if (payment) {
    userId = payment.userId
    planId = payment.plan
  } else {
    // Fallback: читаем из metadata вебхука
    userId = object.metadata?.userId
    planId = object.metadata?.planId
    if (!userId || !planId) {
      console.error(`[webhook] payment ${paymentId} not found and metadata missing`)
      return
    }
  }

  const plan = getPlan(planId)

  // Обновляем статус платежа
  await setPayment(paymentId, {
    userId,
    plan: planId,
    amount: payment?.amount ?? Number(object.amount.value),
    currency: payment?.currency ?? object.amount.currency,
    status: 'succeeded',
    createdAt: payment?.createdAt ?? new Date().toISOString(),
  })

  // Активируем подписку
  const now = new Date()
  const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)

  await setSubscription({
    userId,
    plan: planId,
    status: 'active',
    expiresAt: expiresAt.toISOString(),
    paymentId,
    createdAt: now.toISOString(),
  })

  console.log(`[webhook] subscription activated userId=${userId} plan=${planId} expires=${expiresAt.toISOString()}`)
}

async function handlePaymentCancelled(paymentId: string): Promise<void> {
  const payment = await getPayment(paymentId)
  if (!payment) {
    console.warn(`[webhook] cancelled payment ${paymentId} not found in Redis`)
    return
  }

  await setPayment(paymentId, { ...payment, status: 'cancelled' })
  console.log(`[webhook] payment cancelled paymentId=${paymentId} userId=${payment.userId}`)
}
