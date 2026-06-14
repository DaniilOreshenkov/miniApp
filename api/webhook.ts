import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
  token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
});

// Длительность подписки в секундах
const PLAN_EXPIRY: Record<string, number> = {
  monthly:  30 * 24 * 60 * 60,
  pro:     365 * 24 * 60 * 60,
};

// Сумма для автосписания (должна совпадать с create-payment.ts и UI)
const PLAN_AMOUNT: Record<string, string> = {
  monthly: "349.00",
  pro:     "2990.00",
};

const RECURRING_PLANS = new Set<string>(["monthly", "pro"]);

export const config = {
  api: { bodyParser: true },
};

// YooKassa IP ranges: https://yookassa.ru/developers/using-api/webhooks
const isYooKassaIp = (ip: string): boolean => {
  // Exact match для IPv4 (CIDR-проверку оставляем простой: смотрим на известные одиночные адреса).
  // В продакшене можно добавить полноценный CIDR-парсер.
  return (
    ip.startsWith("185.71.76.") ||
    ip.startsWith("185.71.77.") ||
    ip.startsWith("77.75.153.") ||
    ip.startsWith("77.75.154.") ||
    ip === "77.75.156.11" ||
    ip === "77.75.156.35" ||
    ip.startsWith("2a02:5180:")
  );
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Проверяем IP источника — принимаем только от YooKassa
  const clientIp = (req.headers["x-forwarded-for"] as string | undefined)
    ?.split(",")[0]?.trim() ?? "";

  if (clientIp && !isYooKassaIp(clientIp)) {
    console.warn(`[webhook] Rejected non-YooKassa IP: ${clientIp}`);
    return res.status(200).end(); // 200 чтобы не раскрывать информацию атакующему
  }

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

    // Верифицируем платёж напрямую через YooKassa API — не доверяем только webhook-телу
    const shopId    = process.env.YOOKASSA_SHOP_ID?.trim();
    const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
    if (shopId && secretKey && event.object.id) {
      try {
        const verifyRes = await fetch(`https://api.yookassa.ru/v3/payments/${event.object.id}`, {
          headers: {
            "Authorization": "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
          },
        });
        if (!verifyRes.ok) return res.status(200).end();
        const verified = await verifyRes.json() as { status: string; metadata?: { userId?: string; planId?: string } };
        // Статус и метаданные должны совпадать с тем что пришло в webhook
        if (verified.status !== "succeeded") return res.status(200).end();
        if (verified.metadata?.userId !== userId || verified.metadata?.planId !== planId) {
          console.warn(`[webhook] Metadata mismatch for payment ${event.object.id}`);
          return res.status(200).end();
        }
      } catch {
        // Если не смогли проверить — не обрабатываем
        return res.status(200).end();
      }
    }

    const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
    const paymentType = (event.object.metadata as Record<string, string> | undefined)?.type;
    const isTrial = paymentType === "trial";

    // Для триала: доступ на весь срок плана, но первое списание — через 3 дня.
    // Для обычной покупки: следующее списание через expiry.
    const TRIAL_DAYS = 3;
    const nextChargeAt = isTrial
      ? Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
      : Date.now() + expiry * 1000;

    // Активируем план сразу (и при триале, и при обычной покупке)
    await redis.set(`plan:${userId}`, planId, { ex: expiry + 86400 }); // +1 день запаса

    // Для рекуррентных планов сохраняем payment_method_id для автосписания
    if (RECURRING_PLANS.has(planId)) {
      const pm = event.object.payment_method;
      if (pm?.saved && pm.id) {
        await redis.set(`pm:${userId}`, pm.id);

        // fullAmount из metadata (для триала — это реальная сумма следующего списания)
        const fullAmount = (event.object.metadata as Record<string, string> | undefined)?.fullAmount
          ?? PLAN_AMOUNT[planId];

        await redis.set(`sub:${userId}`, JSON.stringify({
          planId,
          amount: fullAmount,
          nextChargeAt,
          paymentMethodId: pm.id,
          isTrial,
          trialEndsAt: isTrial ? nextChargeAt : null,
        }));

        await redis.sadd("subscribers", userId);

        console.log(
          `${isTrial ? "Trial" : "Subscription"} saved for ${userId},`,
          `next charge: ${new Date(nextChargeAt).toISOString()},`,
          `amount: ${fullAmount}₽`,
        );
      }
    }
  }

  return res.status(200).end();
}
