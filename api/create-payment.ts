import type { VercelRequest, VercelResponse } from "@vercel/node";

// trialAmount — сумма для привязки карты (1₽). После 3 дней cron списывает amount.
// null = без триала (стартер — разовая покупка).
const PLANS: Record<string, { amount: string; trialAmount: string | null; description: string; recurring: boolean }> = {
  starter: { amount: "169.00", trialAmount: null,   description: "Beadly Стартер",          recurring: false },
  monthly: { amount: "349.00", trialAmount: "1.00", description: "Beadly Студия (месяц)",   recurring: true  },
  pro:     { amount: "2990.00", trialAmount: "1.00", description: "Beadly Студия (год)",     recurring: true  },
};

// Белый список разрешённых returnUrl — только наш Telegram bot
const ALLOWED_RETURN_URLS = [
  "https://t.me/Beadlybot",
  "https://t.me/Beadlybot?startapp",
];

const isAllowedReturnUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ALLOWED_RETURN_URLS.some(allowed => url.startsWith(allowed)) &&
      parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { planId, userId, returnUrl } = req.body as {
    planId?: string;
    userId?: string;
    returnUrl?: string;
  };

  if (!planId || !userId || !returnUrl) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Защита от Open Redirect / SSRF
  if (!isAllowedReturnUrl(returnUrl)) {
    return res.status(400).json({ error: "Invalid returnUrl" });
  }

  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: "Invalid plan" });

  const shopId    = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  // Для рекуррентных планов первый платёж — 1₽ для привязки карты (триал).
  // Полная сумма спишется через 3 дня через cron.
  const isTrial = plan.recurring && plan.trialAmount !== null;
  const chargeAmount = isTrial ? plan.trialAmount! : plan.amount;

  const body: Record<string, unknown> = {
    amount:       { value: chargeAmount, currency: "RUB" },
    confirmation: { type: "redirect", return_url: returnUrl },
    description:  isTrial
      ? `${plan.description} — привязка карты (3 дня бесплатно)`
      : plan.description,
    metadata:     { userId, planId, type: isTrial ? "trial" : "purchase", fullAmount: plan.amount },
    capture:      true,
  };

  // Для рекуррентных планов сохраняем карту для последующего автосписания
  if (plan.recurring) {
    body.save_payment_method = true;
  }

  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
      "Idempotence-Key": `${userId}-${planId}-${Date.now()}`,
    },
    body: JSON.stringify(body),
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
