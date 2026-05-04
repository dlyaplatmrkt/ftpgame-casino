import { Context } from "telegraf";
import { getUserById, updateBalance, recordGame, addXP } from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { rouletteSizeBetMenu } from "../utils/keyboards";
import { config } from "../config";

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

// Roulette spin frames — premium animated wheel
const SPIN_FRAMES = [
  "🎡 <b>Крутим колесо...</b>",
  "🔴⚫🟢🔴⚫🟢🔴⚫  <i>быстрее...</i>",
  "⚫🟢🔴⚫🟢🔴⚫🟢  <i>ещё...</i>",
  "🟢🔴⚫🟢🔴⚫🟢🔴  <i>замедляется...</i>",
  "🎯 <b>Шарик летит...</b>",
];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function getColor(n: number) {
  if (n === 0) return "green";
  return RED_NUMBERS.includes(n) ? "red" : "black";
}
function colorEmoji(c: string) {
  return c === "green" ? "🟢" : c === "red" ? "🔴" : "⚫";
}

export async function showRouletteMenu(ctx: Context) {
  const text =
    `🎡 <b>РУЛЕТКА</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🔴 Красное → <b>×2</b>\n` +
    `⚫ Чёрное → <b>×2</b>\n` +
    `🟢 Зеро → <b>×14</b>\n` +
    `🔢 Число → <b>×36</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Выбери тип ставки:`;

  const kb = {
    inline_keyboard: [
      [
        { text: "🔴 Красное ×2", callback_data: "roulette_red" },
        { text: "⚫ Чёрное ×2", callback_data: "roulette_black" },
      ],
      [
        { text: "🟢 Зеро ×14", callback_data: "roulette_green" },
        { text: "🔢 Число ×36", callback_data: "roulette_number" },
      ],
      [{ text: "🔙 К играм", callback_data: "back_games" }],
    ],
  };

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb })
    .catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: kb }));
}

export async function showRouletteBetSize(ctx: Context, betType: string) {
  const labels: Record<string, string> = {
    red: "🔴 Красное ×2", black: "⚫ Чёрное ×2",
    green: "🟢 Зеро ×14", number: "🔢 Число ×36",
  };
  const text = `🎡 <b>РУЛЕТКА — ${labels[betType]}</b>\n\nВыбери ставку:`;
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: rouletteSizeBetMenu(betType).reply_markup,
  }).catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: rouletteSizeBetMenu(betType).reply_markup }));
}

export async function playRoulette(ctx: Context, betType: string, bet: number, chosenNumber?: number) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) return ctx.reply(`❌ Недостаточно средств\n💼 Баланс: <b>${formatBalance(user.balance)} 🪙</b>`, { parse_mode: "HTML" });
  if (bet < config.MIN_BET || bet > config.MAX_BET) return ctx.reply(`❌ Ставка: ${config.MIN_BET}–${config.MAX_BET} 🪙`);

  await updateBalance(userId, -bet);

  const msg = await ctx.reply(`🎡 <b>РУЛЕТКА</b>\n\n🌀 Подготовка...`, { parse_mode: "HTML" });

  // Animated spin frames
  for (const frame of SPIN_FRAMES) {
    await sleep(550);
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
      `🎡 <b>РУЛЕТКА</b>\n━━━━━━━━━━━━━━━\n${frame}`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  const result = Math.floor(Math.random() * 37); // 0-36
  const color = getColor(result);
  const cEmoji = colorEmoji(color);

  // Build wheel display around result
  const wheel: string[] = [];
  for (let i = result - 3; i <= result + 3; i++) {
    const n = ((i % 37) + 37) % 37;
    const c = getColor(n);
    const e = colorEmoji(c);
    wheel.push(n === result ? `[<b>${e}${n}</b>]` : `${e}${n}`);
  }
  const wheelStr = wheel.join(" ");

  let multiplier = 0, won = false, betLabel = "";
  if (betType === "red")    { won = color === "red";   multiplier = 2;  betLabel = "🔴 Красное"; }
  if (betType === "black")  { won = color === "black"; multiplier = 2;  betLabel = "⚫ Чёрное"; }
  if (betType === "green")  { won = color === "green"; multiplier = 14; betLabel = "🟢 Зеро"; }
  if (betType === "number" && chosenNumber !== undefined) {
    won = result === chosenNumber; multiplier = 36; betLabel = `🔢 Число ${chosenNumber}`;
  }

  const winAmount = won ? bet * multiplier : 0;
  if (won) await updateBalance(userId, winAmount);

  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "roulette", bet, won ? "win" : "loss", winAmount, { betType, chosenNumber, result, color, multiplier });

  const updatedUser = await getUserById(userId);

  await sleep(400);
  await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
    `🎡 <b>РУЛЕТКА</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${wheelStr}\n\n` +
    `Выпало: <b>${cEmoji} ${result}</b>  |  Ставка: ${betLabel}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `${won ? `🏆 <b>ПОБЕДА!</b>  ×${multiplier}` : "💀 <b>ПРОИГРЫШ</b>"}\n` +
    `💸 Ставка: <b>${formatBalance(bet)} 🪙</b>\n` +
    (won
      ? `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n`
      : `📉 Потеряно: <b>${formatBalance(bet)} 🪙</b>\n`) +
    `⭐️ XP: <b>+${xpGain}</b>  |  💼 Баланс: <b>${formatBalance(updatedUser?.balance || 0)} 🪙</b>` +
    (leveledUp ? `\n🆙 <b>УРОВЕНЬ ${newLevel}!</b> 🎊` : ""),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🔄 Снова (${betLabel})`, callback_data: `rou_bet_${betType}_${bet}` },
            { text: "🎮 Меню", callback_data: "back_games" },
          ],
          [{ text: "🎡 Другая ставка", callback_data: "game_roulette" }],
        ],
      },
    }
  ).catch(() => {});
}
