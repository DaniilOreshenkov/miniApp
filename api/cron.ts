/**
 * Ежедневный cron — списывает деньги у подписчиков у которых истекает подписка.
 * Vercel вызывает этот endpoint автоматически по расписанию из vercel.json.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
  token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron посылает Authorization header
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  const userIds = await redis.smembers("subscribers") as string[];
  console.log(`Cron: checking ${userIds.length} subscribers`);

  // Загружаем все данные подписок параллельно
  const subEntries = await Promise.all(
    userIds.map(async (userId) => {
      const subRaw = await redis.get<string>(`sub:${userId}`);
      return { userId, subRaw };
    }),
  );

  // Фильтруем и запускаем списания параллельно
  const chargePromises = subEntries.map(async ({ userId, subRaw }) => {
    if (!subRaw) {
      await redis.srem("subscribers", userId);
      return null;
    }

    const sub = typeof subRaw === "string" ? JSON.parse(subRaw) : subRaw as {
      nextChargeAt: number;
    };

    // Списываем если до следующего платежа осталось меньше 1 дня
    const hoursLeft = (sub.nextChargeAt - Date.now()) / 3_600_000;
    if (hoursLeft >= 24) return null;

    console.log(`Charging ${userId}, hours left: ${hoursLeft.toFixed(1)}`);

    try {
      const chargeRes = await fetch(`${process.env.APP_URL}/api/charge`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "x-cron-secret": process.env.CRON_SECRET!,
        },
        body: JSON.stringify({ userId }),
      });
      const result = await chargeRes.json() as Record<string, unknown>;
      return { userId, ...result };
    } catch (err) {
      console.error(`Cron charge error for ${userId}:`, err);
      return { userId, ok: false, error: "network_error" };
    }
  });

  const settled = await Promise.all(chargePromises);
  const results = settled.filter(Boolean);

  return res.json({ processed: results.length, results });
}
