import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

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

  console.log("WEBHOOK EVENT:", JSON.stringify(event, null, 2));

  if (event.type === "payment.succeeded") {
    const { userId, planId } = event.object.metadata ?? {};
    console.log("PAYMENT SUCCEEDED userId:", userId, "planId:", planId);

    if (userId && planId) {
      const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
      await redis.set(`plan:${userId}`, planId, { ex: expiry });
      console.log("SAVED TO REDIS:", `plan:${userId}`, "=", planId);
    } else {
      console.log("MISSING userId or planId in metadata");
    }
  } else {
    console.log("SKIPPED event type:", event.type);
  }

  return res.status(200).end();
}
