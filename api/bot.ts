/**
 * Telegram bot webhook handler.
 * Обрабатывает команды /start и /open — отправляет кнопку открытия Mini App.
 *
 * Настройка:
 * 1. Добавьте TELEGRAM_BOT_TOKEN в Vercel env
 * 2. Зарегистрируйте вебхук один раз:
 *    https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mini-app-ruddy-sigma.vercel.app/api/bot
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN ?? "";
const APP_URL    = process.env.APP_URL ?? "https://mini-app-ruddy-sigma.vercel.app";
const BETA_MODE  = process.env.BETA_MODE === "true";
const BETA_USERS = new Set(
  (process.env.BETA_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

interface TgUpdate {
  message?: {
    chat: { id: number };
    from?: { id?: number; first_name?: string };
    text?: string;
  };
}

async function sendMessage(chatId: number, text: string, replyMarkup?: object) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const update = req.body as TgUpdate;
  const message = update.message;

  if (!message) return res.status(200).end();

  const chatId = message.chat.id;
  const text   = message.text ?? "";
  const name   = message.from?.first_name ?? "друг";

  if (text.startsWith("/start") || text.startsWith("/open")) {
    const userId = String(message.from?.id ?? "");

    // Бета-режим: только разрешённые пользователи видят приложение
    if (BETA_MODE && !BETA_USERS.has(userId)) {
      await sendMessage(
        chatId,
        `👋 Привет, ${name}!\n\n⏳ Beadly скоро откроется для всех. Следи за обновлениями!`,
      );
      return res.status(200).end();
    }

    await sendMessage(
      chatId,
      `✦ Привет, ${name}!\n\n<b>Beadly</b> — приложение для создания схем из бусин прямо в Telegram.\n\nЗагрузи любое изображение — и получи готовую схему в один клик. Или рисуй вручную на сетке и сохраняй результат.\n\nНажми кнопку ниже, чтобы начать:`,
      {
        inline_keyboard: [
          [{ text: "✦ Открыть Beadly", web_app: { url: APP_URL } }],
          [{ text: "📤 Поделиться с друзьями", url: `https://t.me/share/url?url=https://t.me/Beadlybot&text=Создавай+схемы+из+бусин+в+Telegram+%E2%80%94+Beadly` }],
        ],
      },
    );
    return res.status(200).end();
  }

  if (text.startsWith("/help")) {
    await sendMessage(
      chatId,
      `<b>Beadly — как пользоваться</b>\n\n🔸 Нажми «Создать проект» и выбери размер сетки\n🔸 Загрузи фото — приложение само построит схему\n🔸 Рисуй вручную: выбирай цвет и закрашивай бусины\n🔸 Сохраняй и делись готовой схемой\n\nЕсли что-то не работает — напиши нам, разберёмся.`,
      {
        inline_keyboard: [
          [{ text: "✦ Открыть Beadly", web_app: { url: APP_URL } }],
        ],
      },
    );
    return res.status(200).end();
  }

  return res.status(200).end();
}
