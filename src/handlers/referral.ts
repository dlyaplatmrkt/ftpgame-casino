import { Context } from "telegraf";
import { getUserById, getReferrals } from "../db/queries";
import { formatBalance, formatNumber } from "../utils/levels";
import { config } from "../config";

export async function handleReferral(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("❌ Сначала напиши /start");

  const referrals = await getReferrals(user.id);
  const totalEarned = referrals.length * config.REFERRAL_BONUS;

  const botUsername = process.env.BOT_USERNAME || "ftpgame_bot";
  const refLink = `https://t.me/${botUsername}?start=${user.referral_code}`;

  let text =
    `👥 <b>РЕФЕРАЛЬНАЯ ПРОГРАММА</b>\n\n` +
    `🔗 Твоя реферальная ссылка:\n` +
    `<code>${refLink}</code>\n\n` +
    `📊 <b>Статистика:</b>\n` +
    `👤 Приглашено: ${referrals.length} чел.\n` +
    `💰 Заработано: ${formatBalance(totalEarned)} 🪙\n\n` +
    `🎁 <b>Условия:</b>\n` +
    `• Ты получаешь: ${config.REFERRAL_BONUS} 🪙 за каждого друга\n` +
    `• Друг получает: ${config.REFERRAL_WELCOME} 🪙 бонус\n\n`;

  if (referrals.length > 0) {
    text += `👥 <b>Твои рефералы:</b>\n`;
    for (const r of referrals.slice(0, 10)) {
      const date = new Date(r.created_at).toLocaleDateString("ru-RU");
      text += `• ${r.first_name}${r.username ? ` (@${r.username})` : ""} — ${date}\n`;
    }
    if (referrals.length > 10) {
      text += `... и ещё ${referrals.length - 10} чел.\n`;
    }
  } else {
    text +=
      `💡 <b>Как пригласить друзей:</b>\n` +
      `1. Скопируй ссылку выше\n` +
      `2. Отправь другу\n` +
      `3. Получи ${config.REFERRAL_BONUS} 🪙 когда он зарегистрируется!`;
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📤 Поделиться ссылкой",
            url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("🎰 Играй в FTP GAME — лучшее казино в Telegram! Получи бонус при регистрации!")}`,
          },
        ],
        [{ text: "🔄 Обновить статистику", callback_data: "referral_refresh" }],
      ],
    },
  });
}
