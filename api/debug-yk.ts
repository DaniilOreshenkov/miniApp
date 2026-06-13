import type { VercelRequest, VercelResponse } from "@vercel/node";

// Временный диагностический эндпоинт — удалить после отладки
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shopId    = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    return res.json({ error: "Env vars missing", shopId: !!shopId, secretKey: !!secretKey });
  }

  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
      "Idempotence-Key": `debug-${Date.now()}`,
    },
    body: JSON.stringify({
      amount:       { value: "169.00", currency: "RUB" },
      confirmation: { type: "redirect", return_url: "https://t.me/Beadlybot" },
      description:  "debug test",
      capture:      true,
    }),
  });

  const data = await response.json();
  return res.json({ status: response.status, shopIdPrefix: shopId.slice(0, 6), keyPrefix: secretKey.slice(0, 10), data });
}
