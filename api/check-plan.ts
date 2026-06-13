import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const PLAN_EXPIRY: Record<string, number> = {
  monthly:  30 * 24 * 60 * 60,
  pro:     365 * 24 * 60 * 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { userId, paymentId } = req.query as { userId?: string; paymentId?: string };

  if (!userId) return res.json({ planId: "free" });

  try {
    // Если есть paymentId — проверяем именно этот платёж в ЮКасса
    if (paymentId) {
      const shopId    = process.env.YOOKASSA_SHOP_ID?.trim();
      const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

      const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
        headers: {
          "Authorization": "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
        },
      });

      if (!ykRes.ok) return res.json({ planId: "free", paymentStatus: "unknown" });

      const payment = await ykRes.json() as {
        status: string;
        metadata?: { planId?: string; userId?: string };
      };

      if (payment.status === "succeeded" && payment.metadata?.planId) {
        // Защита от повторной активации: проверяем, не был ли этот paymentId уже обработан.
        // Webhook уже должен был активировать план — здесь только подтверждаем.
        const alreadyProcessed = await redis.get(`used_payment:${paymentId}`);
        const planId = payment.metadata.planId;

        if (!alreadyProcessed) {
          // Помечаем paymentId как использованный (TTL 30 дней — достаточно для дедупликации)
          await redis.set(`used_payment:${paymentId}`, "1", { ex: 30 * 24 * 60 * 60 });

          const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
          await redis.set(`plan:${userId}`, planId, { ex: expiry + 86400 });
        }

        return res.json({ planId, paymentStatus: "succeeded" });
      }

      if (payment.status === "canceled") {
        return res.json({ planId: "free", paymentStatus: "canceled" });
      }

      return res.json({ planId: "free", paymentStatus: payment.status });
    }

    // Без paymentId — тихая проверка через Redis
    const planId = await redis.get<string>(`plan:${userId}`);

    // Проверяем есть ли активная автоподписка
    const subRaw = await redis.get<string>(`sub:${userId}`);
    const sub = subRaw
      ? (typeof subRaw === "string" ? JSON.parse(subRaw) : subRaw) as {
          nextChargeAt: number;
          isTrial?: boolean;
          trialEndsAt?: number | null;
        }
      : null;

    return res.json({
      planId:       planId ?? "free",
      autoRenewal:  Boolean(sub),
      nextChargeAt: sub?.nextChargeAt ?? null,
      isTrial:      sub?.isTrial ?? false,
      trialEndsAt:  sub?.trialEndsAt ?? null,
    });

  } catch (e) {
    console.log("check-plan error:", e);
    return res.json({ planId: "free" });
  }
}
