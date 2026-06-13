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

  const { planId, userId, returnUrl, email } = req.body as {
    planId?: string;
    userId?: string;
    returnUrl?: string;
    email?: string;
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

  // .trim() — частая причина invalid_credentials: при вставке ключа в Vercel
  // в конце остаётся пробел или перенос строки, и Basic-auth падает.
  const shopId    = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  // Без ключей боевой платёж создать нельзя — сразу понятная ошибка вместо
  // падения с пустым ответом (раньше это выглядело как «оплата не создана»).
  if (!shopId || !secretKey) {
    console.error("[create-payment] Missing YooKassa credentials (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)");
    return res.status(500).json({
      error: { code: "config_error", description: "Платёжный сервис не настроен. Обратитесь в поддержку." },
    });
  }

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

  // 54-ФЗ: если у магазина в ЛК ЮKassa подключена онлайн-касса (фискализация),
  // платёж БЕЗ чека отклоняется — это частая причина «в тесте работает, на бою
  // падает». Чек включается флагом YOOKASSA_FISCALIZATION=true, чтобы не ломать
  // магазины без кассы (там, наоборот, передача чека вызывает ошибку).
  if (process.env.YOOKASSA_FISCALIZATION === "true") {
    const receiptEmail =
      (typeof email === "string" && email.includes("@") ? email : null) ??
      process.env.YOOKASSA_RECEIPT_EMAIL ??
      null;

    if (!receiptEmail) {
      console.error("[create-payment] Fiscalization on, но нет email для чека (передайте email или задайте YOOKASSA_RECEIPT_EMAIL)");
      return res.status(500).json({
        error: { code: "receipt_email_missing", description: "Не удалось сформировать чек. Обратитесь в поддержку." },
      });
    }

    body.receipt = {
      customer: { email: receiptEmail },
      items: [
        {
          description: plan.description.slice(0, 128),
          quantity: "1.00",
          amount: { value: chargeAmount, currency: "RUB" },
          vat_code: Number(process.env.YOOKASSA_VAT_CODE ?? "1"), // 1 = Без НДС
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    };
  }

  // YooKassa-платёж может содержать описание ошибки в полях верхнего уровня
  // (code / description) либо в confirmation при успехе.
  interface YooKassaPayment {
    id?: string;
    confirmation?: { confirmation_url?: string };
    code?: string;
    description?: string;
    error?: { code?: string; description?: string };
  }

  let response: Response;
  let payment: YooKassaPayment;

  try {
    response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Authorization":   "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64"),
        "Idempotence-Key": `${userId}-${planId}-${Date.now()}`,
      },
      body: JSON.stringify(body),
    });
    payment = await response.json() as YooKassaPayment;
  } catch (err) {
    console.error("[create-payment] Network error talking to YooKassa:", err);
    return res.status(502).json({
      error: { code: "network_error", description: "Не удалось связаться с ЮKassa. Попробуйте позже." },
    });
  }

  // Возвращаем РЕАЛЬНУЮ причину отказа — иначе на фронте всегда показывалось
  // обобщённое «оплата не создана», и понять причину было невозможно.
  if (!response.ok || !payment?.confirmation?.confirmation_url || !payment.id) {
    console.error("[create-payment] YooKassa rejected payment:", JSON.stringify(payment));
    const description =
      payment?.description ??
      payment?.error?.description ??
      "ЮKassa отклонила платёж. Попробуйте ещё раз.";
    const code = payment?.code ?? payment?.error?.code ?? "yookassa_error";
    return res.status(response.ok ? 502 : (response.status || 500)).json({
      error: { code, description },
    });
  }

  return res.json({
    paymentId:       payment.id,
    confirmationUrl: payment.confirmation.confirmation_url,
  });
}
