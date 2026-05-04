import { Context } from "telegraf";
import { getUserById, getReferrals } from "../db/queries";
import { formatBalance, formatNumber } from "../utils/levels";
import { config } from "../config";

export async function handleReferral(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("❌ Сначала напиши /start");

  const referrals = await getReferrals(user.id);
  const earned = referrals.length * config.REFERRAL_BONUS;
  const botUsername = process.env.BOT_USERNAME || "ftpgame_bot";
  const refLink = `https://t.me/${botUsername}?start=${user.referral_code}`;

  let text =
    `👥 <b>Реферальная программа</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🔗 Твоя ссылка:\n<code>${refLink}</code>\n\n` +
    `◆ Приглашено: <b>${formatNumber(referrals.length)}</b> чел.\n` +
    `◆ Заработано: <b>${formatBalance(earned)} 🪙</b>\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🎁 Ты получаешь: <b>+${config.REFERRAL_BONUS} 🪙</b> за каждого\n` +
    `🎁 Друг получает: <b>+${config.REFERRAL_WELCOME} 🪙</b> бонус\n`;

  if (referrals.length > 0) {
    text += `\n<b>Последние рефералы:</b>\n`;
    for (const r of referrals.slice(0, 8)) {
      const date = new Date(r.created_at).toLocaleDateString("ru-RU");
      text += `◆ <b>${r.first_name}</b>${r.username ? ` @${r.username}` : ""}  <i>${date}</i>\n`;
    }
    if (referrals.length > 8) text += `<i>... и ещё ${referrals.length - 8}</i>\n`;
  }

  const shareText = encodeURIComponent("🎰 Играй в FTP GAME! Получи бонус при регистрации!");
  const shareUrl = encodeURIComponent(refLink);

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Поделиться ссылкой", url: `https://t.me/share/url?url=${shareUrl}&text=${shareText}` }],
        [{ text: "🔄 Обновить", callback_data: "referral_refresh" }],
      ],
    },
  });
}
