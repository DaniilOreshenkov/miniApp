import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const PLAN_EXPIRY: Record<string, number> = {
  starter: 365 * 24 * 60 * 60,
  monthly:  30 * 24 * 60 * 60,
  pro:      365 * 24 * 60 * 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { userId, paymentId } = req.query as { userId?: string; paymentId?: string };

  if (!userId) return res.json({ planId: "free" });

  try {
    // 1. Проверяем Redis — вдруг webhook уже записал
    const cached = await redis.get<string>(`plan:${userId}`);
    if (cached) return res.json({ planId: cached });

    // 2. Если есть paymentId — проверяем напрямую в ЮКасса
    if (paymentId) {
      const shopId    = process.env.YOOKASSA_SHOP_ID;
      const secretKey = process.env.YOOKASSA_SECRET_KEY;

      const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
        headers: {
          "Authorization": "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
        },
      });

      if (ykRes.ok) {
        const payment = await ykRes.json() as {
          status: string;
          metadata?: { planId?: string; userId?: string };
        };

        if (payment.status === "succeeded" && payment.metadata?.planId) {
          const planId = payment.metadata.planId;
          const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
          // Сохраняем в Redis чтобы следующий раз не ходить в ЮКасса
          await redis.set(`plan:${userId}`, planId, { ex: expiry });
          return res.json({ planId });
        }
      }
    }

    return res.json({ planId: "free" });
  } catch (e) {
    console.log("check-plan error:", e);
    return res.json({ planId: "free" });
  }
}
