/**
 * Списывает деньги с сохранённой карты пользователя.
 * Вызывается из cron.ts для автопродления подписки.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Длительность подписки по плану (совпадает с webhook.ts и create-payment.ts)
const PLAN_EXPIRY_SECONDS: Record<string, number> = {
  monthly:  30 * 24 * 60 * 60,
  pro:     365 * 24 * 60 * 60, // годовой план
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Защита — только внутренние вызовы из cron
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) return res.status(401).end();

  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ error: "No userId" });

  const subRaw = await redis.get<string>(`sub:${userId}`);
  if (!subRaw) return res.status(404).json({ error: "No subscription" });

  const sub = typeof subRaw === "string" ? JSON.parse(subRaw) : subRaw as {
    planId: string;
    amount: string;
    nextChargeAt: number;
    paymentMethodId: string;
  };

  const shopId    = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  // Получаем длительность подписки для данного плана
  const expirySeconds = PLAN_EXPIRY_SECONDS[sub.planId] ?? PLAN_EXPIRY_SECONDS.monthly;

  let payment: { id: string; status: string; error?: unknown };

  try {
    // Создаём платёж с сохранённой картой — пользователь ничего не нажимает
    const response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Authorization":   "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
        "Idempotence-Key": `renewal-${userId}-${sub.planId}-${Date.now()}`,
      },
      body: JSON.stringify({
        amount:            { value: sub.amount, currency: "RUB" },
        capture:           true,
        payment_method_id: sub.paymentMethodId,
        description:       `Продление подписки Beadly ${sub.planId}`,
        metadata:          { userId, planId: sub.planId, type: "renewal" },
      }),
    });

    payment = await response.json() as { id: string; status: string; error?: unknown };

    if (!response.ok || payment.status === "canceled") {
      console.log(`Charge failed for ${userId}:`, payment);
      // Платёж не прошёл — отменяем подписку
      await redis.del(`sub:${userId}`);
      await redis.del(`pm:${userId}`);
      await redis.srem("subscribers", userId);
      return res.json({ ok: false, error: payment });
    }
  } catch (err) {
    console.error(`Charge network error for ${userId}:`, err);
    return res.status(500).json({ ok: false, error: "network_error" });
  }

  if (payment.status === "succeeded") {
    const nextChargeAt = Date.now() + expirySeconds * 1000;
    // Продлеваем план в Redis
    await redis.set(`plan:${userId}`, sub.planId, { ex: expirySeconds + 86400 });
    // Обновляем дату следующего списания
    await redis.set(`sub:${userId}`, JSON.stringify({ ...sub, nextChargeAt }));
    console.log(`Renewed ${userId} → ${sub.planId}, next: ${new Date(nextChargeAt).toISOString()}`);
  }

  return res.json({ ok: true, status: payment.status });
}
