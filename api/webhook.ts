import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Длительность подписки в секундах
const PLAN_EXPIRY: Record<string, number> = {
  starter: 365 * 24 * 60 * 60,
  monthly:  30 * 24 * 60 * 60,
  pro:      30 * 24 * 60 * 60,
};

// Сумма для автосписания
const PLAN_AMOUNT: Record<string, string> = {
  monthly: "300.00",
  pro:     "750.00",
};

const RECURRING_PLANS = new Set(["monthly", "pro"]);

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  let event: {
    type: string;
    object: {
      id: string;
      status: string;
      payment_method?: { id: string; saved: boolean };
      metadata?: { userId?: string; planId?: string };
    };
  };

  try {
    event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(200).end();
  }

  if (event.type === "payment.succeeded") {
    const { userId, planId } = event.object.metadata ?? {};
    if (!userId || !planId) return res.status(200).end();

    const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
    const nextChargeAt = Date.now() + expiry * 1000;

    // Стартер: не протухает, инкрементируем счётчик слотов проектов
    if (planId === "starter") {
      await redis.set(`plan:${userId}`, planId); // без expiry — стартер навсегда
      await redis.incr(`starter_slots:${userId}`);
      return res.status(200).end();
    }

    // Сохраняем активный план
    await redis.set(`plan:${userId}`, planId, { ex: expiry + 86400 }); // +1 день запаса

    // Для месячных планов сохраняем payment_method_id для автосписания
    if (RECURRING_PLANS.has(planId)) {
      const pm = event.object.payment_method;
      if (pm?.saved && pm.id) {
        await redis.set(`pm:${userId}`, pm.id); // без expiry — нужен пока подписка активна

        // Подписка: когда списывать следующий раз
        await redis.set(`sub:${userId}`, JSON.stringify({
          planId,
          amount: PLAN_AMOUNT[planId],
          nextChargeAt,
          paymentMethodId: pm.id,
        }));

        // Добавляем userId в список активных подписок
        await redis.sadd("subscribers", userId);

        console.log(`Subscription saved for ${userId}, next charge: ${new Date(nextChargeAt).toISOString()}`);
      }
    }
  }

  return res.status(200).end();
}
