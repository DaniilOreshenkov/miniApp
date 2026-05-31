import type { VercelRequest, VercelResponse } from "@vercel/node";

const PLANS: Record<string, { amount: string; description: string }> = {
  starter: { amount: "169.00", description: "Beadly Стартер" },
  monthly: { amount: "300.00", description: "Beadly Месячная" },
  pro:     { amount: "750.00", description: "Beadly Про" },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { planId, userId, returnUrl } = req.body as {
    planId: string;
    userId: string;
    returnUrl: string;
  };

  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: "Invalid plan" });

  const shopId    = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
      "Idempotence-Key": `${userId}-${planId}-${Date.now()}`,
    },
    body: JSON.stringify({
      amount:       { value: plan.amount, currency: "RUB" },
      confirmation: { type: "redirect", return_url: returnUrl },
      description:  plan.description,
      metadata:     { userId, planId },
      capture:      true,
    }),
  });

  const payment = await response.json() as {
    id: string;
    confirmation: { confirmation_url: string };
    error?: unknown;
  };

  if (!response.ok) return res.status(500).json({ error: payment });

  return res.json({
    paymentId:       payment.id,
    confirmationUrl: payment.confirmation.confirmation_url,
  });
}
