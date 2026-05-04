import { User } from "../db/queries";
import { getLevelInfo, getProgressBar, formatBalance, formatNumber } from "./levels";
import { config } from "../config";

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export function cabinetMessage(user: User): string {
  const lvl = getLevelInfo(user.xp);
  const bar = getProgressBar(lvl.progress, 12);
  const winRate =
    user.total_games > 0
      ? ((user.total_wins / user.total_games) * 100).toFixed(1)
      : "0.0";

  const registeredDays = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / 86400000
  );

  return (
    `╔══════════════════════╗\n` +
    `║   👤 ЛИЧНЫЙ КАБИНЕТ   ║\n` +
    `╚══════════════════════╝\n\n` +
    `${lvl.emoji} <b>${escMd(user.first_name)}</b>\n` +
    `🆔 ID: <code>${user.id}</code>\n` +
    (user.username ? `📎 @${user.username}\n` : "") +
    `\n` +
    `━━━━━━ 💎 УРОВЕНЬ ━━━━━━\n` +
    `${lvl.name} (${lvl.level}/10)\n` +
    `⭐ XP: ${formatNumber(user.xp)}\n` +
    `[${bar}] ${lvl.progress}%\n` +
    (lvl.level < 10
      ? `📈 До след. уровня: ${formatNumber(lvl.nextXP - lvl.currentXP)} XP\n`
      : `🏆 Максимальный уровень!\n`) +
    `\n` +
    `━━━━━━ 💰 ФИНАНСЫ ━━━━━━\n` +
    `💵 Баланс: <b>${formatBalance(user.balance)} 🪙</b>\n` +
    `📈 Выиграно: ${formatBalance(user.total_won)} 🪙\n` +
    `📉 Поставлено: ${formatBalance(user.total_wagered)} 🪙\n` +
    `\n` +
    `━━━━━━ 🎮 СТАТИСТИКА ━━━━━\n` +
    `🎯 Игр сыграно: ${formatNumber(user.total_games)}\n` +
    `🏆 Побед: ${formatNumber(user.total_wins)}\n` +
    `📊 Процент побед: ${winRate}%\n` +
    `📅 В игре: ${registeredDays} дн.\n` +
    `\n` +
    `🔗 Реф. код: <code>${user.referral_code}</code>`
  );
}

function escMd(text: string): string {
  return text.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );
}

export function welcomeMessage(user: User, isNew: boolean): string {
  const name = escMd(user.first_name);
  if (isNew) {
    return (
      `🎰 <b>Добро пожаловать в ${config.PROJECT_NAME}!</b>\n\n` +
      `Привет, ${name}! 👋\n\n` +
      `🎁 Тебе начислено <b>10 🪙</b> приветственного бонуса!\n\n` +
      `🎮 <b>Наши игры:</b>\n` +
      `🎲 DICE — бросай кости один или с друзьями\n` +
      `🎰 Слоты — испытай удачу на барабанах\n` +
      `🪙 Монетка — орёл или решка\n` +
      `🎡 Рулетка — европейская рулетка\n\n` +
      `💎 <b>Система уровней:</b> 10 уровней от Новичка до GOD MODE\n` +
      `👥 <b>Рефералы:</b> приглашай друзей и получай бонусы\n\n` +
      `📞 Поддержка: ${config.SUPPORT}`
    );
  }
  return (
    `🎰 <b>${config.PROJECT_NAME}</b>\n\n` +
    `С возвращением, ${name}! 🎉\n\n` +
    `💵 Баланс: <b>${formatBalance(user.balance)} 🪙</b>\n\n` +
    `Выбери действие в меню ниже 👇`
  );
}

export function gameResultMessage(
  game: string,
  bet: number,
  won: boolean,
  winAmount: number,
  details: string
): string {
  const result = won
    ? `🎉 <b>ПОБЕДА!</b> +${formatBalance(winAmount)} 🪙`
    : `😔 <b>ПРОИГРЫШ!</b> -${formatBalance(bet)} 🪙`;

  return (
    `${result}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 Игра: ${game}\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n` +
    `${details}\n` +
    `━━━━━━━━━━━━━━━━━━━`
  );
}

export function topMessage(players: User[]): string {
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  let msg = `🏆 <b>ТОП ИГРОКОВ ${config.PROJECT_NAME}</b>\n\n`;
  players.forEach((p, i) => {
    const name = escMd(p.first_name);
    msg += `${medals[i]} <b>${name}</b> — ${formatBalance(p.balance)} 🪙\n`;
    msg += `   🎮 ${p.total_games} игр • 🏆 ${p.total_wins} побед\n`;
  });
  return msg;
}

export function helpMessage(): string {
  return (
    `╔══════════════════════╗\n` +
    `║    ℹ️ ПОМОЩЬ FTP GAME  ║\n` +
    `╚══════════════════════╝\n\n` +
    `<b>🎮 Игры:</b>\n` +
    `🎲 <b>DICE</b> — бросаешь кость. Solo: > 3 = ×2. Multi: выше соперника = ×2\n` +
    `🎰 <b>Слоты</b> — 3 барабана. 3 💎 = ×10, 3 ⭐ = ×5, 3 одинаковых = ×3\n` +
    `🪙 <b>Монетка</b> — орёл/решка = ×2. Мультиплеер: ставки складываются\n` +
    `🎡 <b>Рулетка</b> — 🔴⚫ ×2, 🟢 зеро ×14, 🔢 число ×36\n\n` +
    `<b>💰 Пополнение:</b>\n` +
    `Принимаем TON, BTC, ETH, USDT через CryptoBot\n\n` +
    `<b>💎 Уровни:</b>\n` +
    `10 уровней. XP = ставка × 0.1 (+ 0.2 за победу)\n\n` +
    `<b>👥 Рефералы:</b>\n` +
    `Ты: +25 🪙 за каждого друга\n` +
    `Друг: +10 🪙 приветственный бонус\n\n` +
    `<b>🔒 Честная игра:</b>\n` +
    `Используем криптографически стойкий генератор случайных чисел\n\n` +
    `📞 Поддержка: ${config.SUPPORT}`
  );
}
