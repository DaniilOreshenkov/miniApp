import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { userId } = req.query;

  if (!userId || typeof userId !== "string") {
    return res.json({ planId: "free" });
  }

  try {
    const planId = await redis.get<string>(`plan:${userId}`);
    return res.json({ planId: planId ?? "free" });
  } catch {
    return res.json({ planId: "free" });
  }
}
