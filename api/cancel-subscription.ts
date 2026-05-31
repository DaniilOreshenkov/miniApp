/**
 * Отменяет автопродление подписки пользователя.
 * Текущий период остаётся активным до конца оплаченного срока.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ error: "No userId" });

  // Удаляем подписку — cron больше не будет списывать
  // Plan в Redis остаётся до истечения TTL (до конца оплаченного периода)
  await redis.del(`sub:${userId}`);
  await redis.del(`pm:${userId}`);
  await redis.srem("subscribers", userId);

  console.log(`Subscription cancelled for ${userId}`);
  return res.json({ ok: true });
}
