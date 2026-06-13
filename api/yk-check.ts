import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * ВРЕМЕННЫЙ диагностический endpoint для проверки боевых ключей ЮKassa.
 *
 * Как пользоваться:
 *   1. Создай в Vercel env-переменную DEBUG_TOKEN со значением на свой выбор
 *      (например beadly-debug-123), Environment = Production. Сделай Redeploy.
 *   2. Открой в браузере:
 *      https://<твой-домен>/api/yk-check?token=beadly-debug-123
 *   3. Пришли вывод. После починки удали этот файл и переменную DEBUG_TOKEN.
 *
 * Безопасность: полный секретный ключ НЕ раскрывается — только его префикс
 * (live_/test_), длина и факт наличия пробелов. shopId не является секретом.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.DEBUG_TOKEN;
  if (!token || req.query.token !== token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const rawShop = process.env.YOOKASSA_SHOP_ID ?? "";
  const rawKey  = process.env.YOOKASSA_SECRET_KEY ?? "";
  const shopId  = rawShop.trim();
  const secret  = rawKey.trim();

  const diagnostics = {
    shopId_present:       rawShop.length > 0,
    shopId_value:        shopId, // shopId не секрет
    shopId_hadWhitespace: rawShop !== shopId,
    secret_present:       rawKey.length > 0,
    secret_prefix:       secret.slice(0, 5), // ожидается "live_" для боя
    secret_length:       secret.length,
    secret_hadWhitespace: rawKey !== secret,
  };

  // Лёгкая проверка авторизации: GET /v3/me требует только валидную пару
  // shopId:secretKey и ничего не создаёт.
  let yookassa_auth: Record<string, unknown>;
  try {
    const r = await fetch("https://api.yookassa.ru/v3/me", {
      headers: {
        "Authorization": "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64"),
      },
    });
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* оставляем как текст */ }
    yookassa_auth = { status: r.status, ok: r.ok, body };
  } catch (err) {
    yookassa_auth = { error: String(err) };
  }

  return res.status(200).json({ diagnostics, yookassa_auth });
}
