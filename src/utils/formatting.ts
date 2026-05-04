import { User } from "../db/queries";
import { getLevelInfo, getProgressBar, formatBalance, formatNumber } from "./levels";
import { config } from "../config";

function escHtml(t: string) {
  return t.replace(/[<>&]/g, c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

export function escapeMarkdown(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export function cabinetMessage(user: User): string {
  const lvl = getLevelInfo(user.xp);
  const bar = getProgressBar(lvl.progress, 10);
  const winRate = user.total_games > 0 ? ((user.total_wins / user.total_games) * 100).toFixed(1) : "0.0";
  const days = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000);

  return (
    `👤 <b>${escHtml(user.first_name)}</b>` +
    (user.username ? ` · @${user.username}` : "") + `\n` +
    `🆔 <code>${user.id}</code>\n\n` +

    `${lvl.emoji} <b>${lvl.name}</b>  Lvl <b>${lvl.level}</b>/10\n` +
    `[${bar}] <b>${lvl.progress}%</b>` +
    (lvl.level < 10
      ? `  →  ещё <b>${formatNumber(lvl.nextXP - lvl.currentXP)}</b> XP\n`
      : `  🏆 MAX\n`) +
    `⭐️ XP: <b>${formatNumber(user.xp)}</b>\n\n` +

    `━━━━━━━━━━━━━━━\n` +
    `💼 Баланс: <b>${formatBalance(user.balance)} 🪙</b>\n` +
    `📈 Выиграно: <b>${formatBalance(user.total_won)} 🪙</b>\n` +
    `📉 Поставлено: <b>${formatBalance(user.total_wagered)} 🪙</b>\n\n` +

    `🎮 Игр: <b>${formatNumber(user.total_games)}</b>  ·  ` +
    `🏆 Побед: <b>${formatNumber(user.total_wins)}</b>  ·  ` +
    `📊 <b>${winRate}%</b>\n` +
    `📅 В игре: <b>${days} дн.</b>\n\n` +

    `🔗 Реф. код: <code>${user.referral_code}</code>`
  );
}

export function welcomeMessage(user: User, isNew: boolean): string {
  const name = escHtml(user.first_name);
  if (isNew) {
    return (
      `🎰 <b>FTP GAME</b> — Добро пожаловать!\n\n` +
      `Привет, <b>${name}</b>! 👋\n\n` +
      `🎁 Стартовый бонус: <b>+10 🪙</b>\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🎲 DICE  ·  🎰 Слоты  ·  🪙 Монетка  ·  🎡 Рулетка\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `💎 10 уровней  ·  👥 Рефералы  ·  💰 Крипто-оплата\n\n` +
      `📞 Поддержка: ${config.SUPPORT}`
    );
  }
  return (
    `🎰 <b>FTP GAME</b>\n\n` +
    `С возвращением, <b>${name}</b>!\n\n` +
    `💼 Баланс: <b>${formatBalance(user.balance)} 🪙</b>`
  );
}

export function topMessage(players: User[]): string {
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  let msg = `🏆 <b>Топ игроков FTP GAME</b>\n━━━━━━━━━━━━━━━\n`;
  if (players.length === 0) return msg + `Пока никого нет.\n`;
  players.forEach((p, i) => {
    const lvl = getLevelInfo(p.xp);
    msg +=
      `${medals[i]} <b>${escHtml(p.first_name)}</b>  ${lvl.emoji}\n` +
      `    💼 <b>${formatBalance(p.balance)} 🪙</b>  ·  🎮 ${formatNumber(p.total_games)}\n`;
  });
  return msg;
}

export function helpMessage(): string {
  return (
    `ℹ️ <b>FTP GAME — Справка</b>\n` +
    `━━━━━━━━━━━━━━━\n\n` +

    `<b>🎮 Игры:</b>\n` +
    `🎲 <b>DICE</b> — Solo: >3 = ×2  ·  Multi: выше = ×2\n` +
    `🎰 <b>Слоты</b> — 💎×10  🍇×7  🍋×5  🍒×3  Пара×2\n` +
    `🪙 <b>Монетка</b> — орёл/решка ×2  ·  Мультиплеер\n` +
    `🎡 <b>Рулетка</b> — 🔴⚫ ×2  ·  🟢 ×14  ·  Число ×36\n\n` +

    `<b>💰 Пополнение:</b>\n` +
    `TON, BTC, ETH, USDT через CryptoBot\n` +
    `Курс: $1 = 1 🪙\n\n` +

    `<b>💎 Уровни:</b>\n` +
    `10 уровней  ·  XP = ставка × 0.1 (+0.2 за победу)\n\n` +

    `<b>👥 Рефералы:</b>\n` +
    `+25 🪙 тебе  ·  +10 🪙 другу\n\n` +

    `📞 Поддержка: ${config.SUPPORT}`
  );
}
