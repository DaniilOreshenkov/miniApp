import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const PLAN_EXPIRY: Record<string, number> = {
  starter: 365 * 24 * 60 * 60, // 1 год в секундах
  monthly:  30 * 24 * 60 * 60, // 30 дней
  pro:      365 * 24 * 60 * 60, // 1 год
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const event = req.body as {
    type: string;
    object: {
      status: string;
      metadata?: { userId?: string; planId?: string };
    };
  };

  if (event.type === "payment.succeeded") {
    const { userId, planId } = event.object.metadata ?? {};

    if (userId && planId) {
      const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
      // Храним plan для userId с автоудалением через expiry секунд
      await redis.set(`plan:${userId}`, planId, { ex: expiry });
    }
  }

  return res.status(200).end();
}
