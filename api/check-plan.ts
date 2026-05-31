import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { paymentId } = req.query;

  if (!paymentId || typeof paymentId !== "string") {
    return res.json({ planId: "free" });
  }

  const shopId    = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  try {
    const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      headers: {
        "Authorization": "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
      },
    });

    if (!response.ok) return res.json({ planId: "free" });

    const payment = await response.json() as {
      status: string;
      metadata?: { planId?: string };
    };

    if (payment.status === "succeeded" && payment.metadata?.planId) {
      return res.json({ planId: payment.metadata.planId });
    }

    return res.json({ planId: "free" });
  } catch {
    return res.json({ planId: "free" });
  }
}
