const { Telegraf, Markup } = require('telegraf')

const BOT_TOKEN = 'ВАШ_ТОКЕН_ОТ_BOTFATHER'
const MINI_APP_URL = 'https://ВАШ_URL_МИНИ_АППА'

const bot = new Telegraf(BOT_TOKEN)

// /start
bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг'

  ctx.reply(
    `Привет, ${name} 👋\n\nДобро пожаловать в *beadly* — создавай пиксельные рисунки из бусин прямо в Telegram.\n\nНажми кнопку ниже, чтобы открыть:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🎨 Открыть beadly', MINI_APP_URL)],
        [
          Markup.button.callback('📖 Как пользоваться', 'help'),
          Markup.button.url('🔗 Пригласить друга', `https://t.me/share/url?url=https://t.me/beadlybot?start=ref_${ctx.from.id}`)
        ]
      ])
    }
  )
})

// /help
bot.help((ctx) => {
  ctx.reply(
    '*beadly* — помощь\n\nОткрой приложение и всё будет понятно.\n\nЕсли что-то не работает — напиши сюда.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🎨 Открыть beadly', MINI_APP_URL)]
      ])
    }
  )
})

// кнопка "Как пользоваться"
bot.action('help', (ctx) => {
  ctx.answerCbQuery()
  ctx.reply(
    '*beadly* — помощь\n\nОткрой приложение и всё будет понятно.\n\nЕсли что-то не работает — напиши сюда.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🎨 Открыть beadly', MINI_APP_URL)]
      ])
    }
  )
})

bot.launch()
console.log('✅ beadly bot запущен')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
