/**
 * Отменяет автопродление подписки пользователя.
 * Текущий период остаётся активным до конца оплаченного срока.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
  token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Принимаем либо внутренний вызов (x-cron-secret), либо клиентский с api-ключём
  const cronSecret   = req.headers["x-cron-secret"];
  const clientSecret = req.headers["x-api-secret"];
  const isInternal   = cronSecret === process.env.CRON_SECRET;
  const isClient     = clientSecret === process.env.CLIENT_API_SECRET;

  if (!isInternal && !isClient) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json({ error: "No userId" });

  // Удаляем подписку — cron больше не будет списывать
  // Plan в Redis остаётся до истечения TTL (до конца оплаченного периода)
  await redis.del(`sub:${userId}`);
  await redis.del(`pm:${userId}`);
  await redis.srem("subscribers", userId);

  console.log(`Subscription cancelled for ${userId}`);
  return res.json({ ok: true });
}
