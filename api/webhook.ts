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

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Парсим тело вручную если пришло как строка
  let event: {
    type: string;
    object: { status: string; metadata?: { userId?: string; planId?: string } };
  };

  try {
    event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    console.log("FAILED TO PARSE BODY:", req.body);
    return res.status(200).end();
  }

  console.log("WEBHOOK EVENT type:", event?.type);
  console.log("WEBHOOK metadata:", JSON.stringify(event?.object?.metadata));

  if (event.type === "payment.succeeded") {
    const { userId, planId } = event.object.metadata ?? {};
    console.log("PAYMENT SUCCEEDED userId:", userId, "planId:", planId);

    if (userId && planId) {
      const expiry = PLAN_EXPIRY[planId] ?? 30 * 24 * 60 * 60;
      await redis.set(`plan:${userId}`, planId, { ex: expiry });
      console.log("SAVED TO REDIS OK");
    } else {
      console.log("MISSING userId or planId");
    }
  } else {
    console.log("SKIPPED event type:", event?.type);
  }

  return res.status(200).end();
}
