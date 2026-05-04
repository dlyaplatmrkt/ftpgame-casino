import { User } from "../db/queries";
import { getLevelInfo, getProgressBar, formatBalance, formatNumber } from "./levels";
import { config } from "../config";

function escHtml(text: string): string {
  return text.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export function cabinetMessage(user: User): string {
  const lvl = getLevelInfo(user.xp);
  const bar = getProgressBar(lvl.progress, 10);
  const winRate =
    user.total_games > 0
      ? ((user.total_wins / user.total_games) * 100).toFixed(1)
      : "0.0";

  const days = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000);

  return (
    `👤 <b>${escHtml(user.first_name)}</b>` +
    (user.username ? ` · @${user.username}` : "") +
    `\n🆔 <code>${user.id}</code>\n\n` +

    `${lvl.emoji} <b>${lvl.name}</b> · Lvl ${lvl.level}/10\n` +
    `[${bar}] ${lvl.progress}%\n` +
    `⭐ XP: ${formatNumber(user.xp)}` +
    (lvl.level < 10 ? ` · до след. ${formatNumber(lvl.nextXP - lvl.currentXP)} XP` : " · MAX") +
    `\n\n` +

    `💵 Баланс: <b>${formatBalance(user.balance)} 🪙</b>\n` +
    `📈 Выиграно: ${formatBalance(user.total_won)} 🪙\n` +
    `📉 Поставлено: ${formatBalance(user.total_wagered)} 🪙\n\n` +

    `🎮 Игр: ${formatNumber(user.total_games)} · 🏆 Побед: ${formatNumber(user.total_wins)} · 📊 ${winRate}%\n` +
    `📅 В игре: ${days} дн.\n\n` +

    `🔗 Реф. код: <code>${user.referral_code}</code>`
  );
}

export function welcomeMessage(user: User, isNew: boolean): string {
  const name = escHtml(user.first_name);
  if (isNew) {
    return (
      `🎰 <b>FTP GAME</b>\n\n` +
      `Привет, ${name}! 👋\n\n` +
      `🎁 Тебе начислено <b>10 🪙</b> на старт!\n\n` +
      `🎲 DICE · 🎰 Слоты · 🪙 Монетка · 🎡 Рулетка\n\n` +
      `Поддержка: ${config.SUPPORT}`
    );
  }
  return (
    `🎰 <b>FTP GAME</b>\n\n` +
    `С возвращением, ${name}!\n\n` +
    `💵 Баланс: <b>${formatBalance(user.balance)} 🪙</b>`
  );
}

export function topMessage(players: User[]): string {
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  let msg = `🏆 <b>Топ игроков</b>\n\n`;
  players.forEach((p, i) => {
    const lvl = getLevelInfo(p.xp);
    msg += `${medals[i]} <b>${escHtml(p.first_name)}</b> — ${formatBalance(p.balance)} 🪙 · ${lvl.emoji} ${lvl.name}\n`;
  });
  if (players.length === 0) msg += `Пока никого нет. Будь первым!`;
  return msg;
}

export function helpMessage(): string {
  return (
    `ℹ️ <b>FTP GAME — Справка</b>\n\n` +

    `<b>Игры:</b>\n` +
    `🎲 <b>DICE</b> — Solo: >3 = ×2 · Multi: кто больше = ×2\n` +
    `🎰 <b>Слоты</b> — 💎💎💎 ×10 · ⭐⭐⭐ ×5 · 3 одинак. ×3\n` +
    `🪙 <b>Монетка</b> — орёл/решка ×2 · Мультиплеер\n` +
    `🎡 <b>Рулетка</b> — 🔴⚫ ×2 · 🟢 зеро ×14 · число ×36\n\n` +

    `<b>Пополнение:</b>\n` +
    `TON, BTC, ETH, USDT через CryptoBot · 1$ = 1 🪙\n\n` +

    `<b>Уровни:</b> 10 уровней, XP = ставка × 0.1 (×0.3 за победу)\n\n` +

    `<b>Рефералы:</b> +25 🪙 тебе, +10 🪙 другу\n\n` +

    `📞 Поддержка: ${config.SUPPORT}`
  );
}
