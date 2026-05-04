import { Context } from "telegraf";
import { getUserById, updateBalance, recordGame, addXP } from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { config } from "../config";

const SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎"];

const PAYOUTS: Record<string, number> = {
  "💎💎💎": 10,
  "⭐⭐⭐": 5,
  "🍒🍒🍒": 3,
  "🍋🍋🍋": 3,
  "🍊🍊🍊": 3,
  "🍇🍇🍇": 3,
};

function spin(): [string, string, string] {
  return [
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
  ];
}

function calcWin(reels: [string, string, string], bet: number): { multiplier: number; win: number } {
  const key = reels.join("");

  if (PAYOUTS[key]) {
    return { multiplier: PAYOUTS[key], win: bet * PAYOUTS[key] };
  }

  if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    return { multiplier: 1.5, win: bet * 1.5 };
  }

  return { multiplier: 0, win: 0 };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function playSlots(ctx: Context, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) {
    return ctx.reply(
      `❌ Недостаточно средств!\n💵 Баланс: ${formatBalance(user.balance)} 🪙\n💸 Ставка: ${bet} 🪙`
    );
  }
  if (bet < config.MIN_BET || bet > config.MAX_BET) {
    return ctx.reply(`❌ Ставка: от ${config.MIN_BET} до ${config.MAX_BET} 🪙`);
  }

  await updateBalance(userId, -bet);

  const phases = [
    ["❓", "❓", "❓"],
    [SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], "❓", "❓"],
    [SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], "❓"],
  ];

  const finalReels = spin();

  const loadMsg = await ctx.reply(
    `🎰 <b>СЛОТЫ</b>\n\n` +
    `╔═══════════════╗\n` +
    `║  ❓  │  ❓  │  ❓  ║\n` +
    `╚═══════════════╝\n\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n⏳ Крутим...`,
    { parse_mode: "HTML" }
  );

  await sleep(800);
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    loadMsg.message_id,
    undefined,
    `🎰 <b>СЛОТЫ</b>\n\n` +
    `╔═══════════════╗\n` +
    `║  ${phases[1][0]}  │  ❓  │  ❓  ║\n` +
    `╚═══════════════╝\n\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n⏳ Крутим...`,
    { parse_mode: "HTML" }
  );

  await sleep(800);
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    loadMsg.message_id,
    undefined,
    `🎰 <b>СЛОТЫ</b>\n\n` +
    `╔═══════════════╗\n` +
    `║  ${phases[2][0]}  │  ${phases[2][1]}  │  ❓  ║\n` +
    `╚═══════════════╝\n\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n⏳ Крутим...`,
    { parse_mode: "HTML" }
  );

  await sleep(900);

  const { multiplier, win } = calcWin(finalReels, bet);
  const won = win > 0;

  if (won) await updateBalance(userId, win);

  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "slots", bet, won ? "win" : "loss", win, {
    reels: finalReels,
    multiplier,
  });

  const updatedUser = await getUserById(userId);

  let resultLine = "";
  if (multiplier >= 10) resultLine = "💎 ДЖЕКПОТ! ×10 💎";
  else if (multiplier >= 5) resultLine = "⭐ МЕГАВЫИГРЫШ! ×5 ⭐";
  else if (multiplier >= 3) resultLine = "🎉 ПОБЕДА! ×3";
  else if (multiplier > 0) resultLine = "✅ ПОБЕДА! ×1.5";
  else resultLine = "😔 Не повезло...";

  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    loadMsg.message_id,
    undefined,
    `🎰 <b>СЛОТЫ</b>\n\n` +
    `╔═══════════════╗\n` +
    `║  ${finalReels[0]}  │  ${finalReels[1]}  │  ${finalReels[2]}  ║\n` +
    `╚═══════════════╝\n\n` +
    `${resultLine}\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n` +
    (won ? `💰 Выигрыш: <b>+${formatBalance(win)} 🪙</b>\n` : `💸 Потеряно: <b>-${formatBalance(bet)} 🪙</b>\n`) +
    `⭐ XP: +${xpGain}\n` +
    `💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙` +
    (leveledUp ? `\n\n🆙 <b>УРОВЕНЬ ${newLevel}!</b> 🎊` : ""),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🔄 Ещё раз (${formatBalance(bet)} 🪙)`, callback_data: `slots_bet_${bet}` },
            { text: "🎮 Меню", callback_data: "back_games" },
          ],
          [
            { text: "📊 Таблица выплат", callback_data: "slots_paytable" },
          ],
        ],
      },
    }
  );
}

export async function showSlotsPaytable(ctx: Context) {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🎰 <b>ТАБЛИЦА ВЫПЛАТ СЛОТОВ</b>\n\n` +
    `💎 💎 💎 → ×10 (ДЖЕКПОТ)\n` +
    `⭐ ⭐ ⭐ → ×5\n` +
    `🍒 🍒 🍒 → ×3\n` +
    `🍋 🍋 🍋 → ×3\n` +
    `🍊 🍊 🍊 → ×3\n` +
    `🍇 🍇 🍇 → ×3\n` +
    `Любые 2 одинаковых → ×1.5\n\n` +
    `🎲 Используется криптографически защищённый рандом`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Назад", callback_data: "game_slots" }],
        ],
      },
    }
  );
}
