import { Context } from "telegraf";
import { getUserById, updateBalance, recordGame, addXP } from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { config } from "../config";

// Telegram 🎰 slot machine: value 1-64, 4 symbols × 4 × 4
// v = value - 1, r1 = v>>4, r2 = (v>>2)&3, r3 = v&3
const REEL_SYMBOLS = ["🍒", "🍋", "🍇", "💎"];
const REEL_NAMES = ["Вишня", "Лимон", "Виноград", "АЛМАЗ"];

function decodeSlot(value: number): [number, number, number] {
  const v = value - 1;
  return [(v >> 4) & 3, (v >> 2) & 3, v & 3];
}

function calcSlotResult(reels: [number, number, number], bet: number) {
  const [r1, r2, r3] = reels;
  const syms = reels.map(r => REEL_SYMBOLS[r]);

  if (r1 === r2 && r2 === r3) {
    if (r1 === 3) return { multiplier: 10, win: bet * 10, label: "💎 JACKPOT!", syms };
    if (r1 === 2) return { multiplier: 7,  win: bet * 7,  label: "🍇 МЕГАВЫИГРЫШ!", syms };
    if (r1 === 1) return { multiplier: 5,  win: bet * 5,  label: "🍋 ТРОЙНИК!", syms };
    return                { multiplier: 3,  win: bet * 3,  label: "🍒 ТРОЙНИК!", syms };
  }
  if (r1 === r2 || r2 === r3 || r1 === r3) {
    return { multiplier: 2, win: bet * 2, label: "✦ ПАРА", syms };
  }
  return { multiplier: 0, win: 0, label: "✕ МИМО", syms };
}

export async function playSlots(ctx: Context, bet: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) return ctx.reply(`❌ Недостаточно средств\n💰 Баланс: **${formatBalance(user.balance)}** 🪙`);
  if (bet < config.MIN_BET || bet > config.MAX_BET) return ctx.reply(`❌ Ставка: ${config.MIN_BET}–${config.MAX_BET} 🪙`);

  await updateBalance(userId, -bet);

  // Telegram native slot machine animation!
  const slotMsg = await ctx.replyWithDice("🎰");
  const value = slotMsg.dice!.value;
  const reels = decodeSlot(value);
  const { multiplier, win, label, syms } = calcSlotResult(reels, bet);
  const won = win > 0;

  // Wait for animation to complete (~2.5s)
  await new Promise(r => setTimeout(r, 2500));

  if (won) await updateBalance(userId, win);
  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "slots", bet, won ? "win" : "loss", win, { reels, multiplier, value });

  const updatedUser = await getUserById(userId);

  const resultText =
    `🎰 <b>СЛОТЫ</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${syms.join(" ")}  <b>${label}</b>\n` +
    (multiplier > 0 ? `📊 Множитель: <b>×${multiplier}</b>\n` : "") +
    `━━━━━━━━━━━━━━━\n` +
    `💸 Ставка: <b>${formatBalance(bet)} 🪙</b>\n` +
    (won
      ? `💰 Выигрыш: <b>+${formatBalance(win)} 🪙</b>\n`
      : `📉 Потеряно: <b>${formatBalance(bet)} 🪙</b>\n`) +
    `⭐️ XP: <b>+${xpGain}</b>\n` +
    `💼 Баланс: <b>${formatBalance(updatedUser?.balance || 0)} 🪙</b>` +
    (leveledUp ? `\n\n🆙 <b>УРОВЕНЬ ${newLevel}!</b> 🎊` : "");

  await ctx.reply(resultText, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔄 Ещё ×${formatBalance(bet)} 🪙`, callback_data: `slots_bet_${bet}` },
          { text: "🎮 Меню", callback_data: "back_games" },
        ],
        [{ text: "📊 Таблица выплат", callback_data: "slots_paytable" }],
      ],
    },
  });
}

export async function showSlotsPaytable(ctx: Context) {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🎰 <b>ТАБЛИЦА ВЫПЛАТ</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `💎 💎 💎 → <b>×10 JACKPOT</b>\n` +
    `🍇 🍇 🍇 → <b>×7</b>\n` +
    `🍋 🍋 🍋 → <b>×5</b>\n` +
    `🍒 🍒 🍒 → <b>×3</b>\n` +
    `Любая пара → <b>×2</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🎲 Используется нативный Telegram рандом`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "game_slots" }]] },
    }
  );
}
