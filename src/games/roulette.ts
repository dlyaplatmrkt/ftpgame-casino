import { Context } from "telegraf";
import { getUserById, updateBalance, recordGame, addXP } from "../db/queries";
import { calcXPGain, formatBalance } from "../utils/levels";
import { rouletteSizeBetMenu } from "../utils/keyboards";
import { config } from "../config";

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK_NUMBERS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

const ROULETTE_FRAMES = [
  "🎡 Колесо вращается...",
  "🌀 Быстрее...",
  "💨 Ещё быстрее...",
  "✨ Замедляется...",
  "🎯 Почти...",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function spinRoulette(): number {
  return Math.floor(Math.random() * 37);
}

function getColor(num: number): string {
  if (num === 0) return "green";
  if (RED_NUMBERS.includes(num)) return "red";
  return "black";
}

function getColorEmoji(color: string): string {
  if (color === "green") return "🟢";
  if (color === "red") return "🔴";
  return "⚫";
}

export async function showRouletteMenu(ctx: Context) {
  const text =
    `🎡 <b>РУЛЕТКА</b>\n\n` +
    `<b>Ставки и выплаты:</b>\n` +
    `🔴 Красное — ×2\n` +
    `⚫ Чёрное — ×2\n` +
    `🟢 Зеро (0) — ×14\n` +
    `🔢 Точное число — ×36\n\n` +
    `Выбери тип ставки:`;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
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
    },
  }).catch(() =>
    ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: {
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
      },
    })
  );
}

export async function showRouletteBetSize(ctx: Context, betType: string) {
  const labels: Record<string, string> = {
    red: "🔴 Красное",
    black: "⚫ Чёрное",
    green: "🟢 Зеро",
    number: "🔢 Число",
  };
  await ctx.editMessageText(
    `🎡 <b>РУЛЕТКА — ${labels[betType]}</b>\n\nВыбери размер ставки:`,
    {
      parse_mode: "HTML",
      reply_markup: rouletteSizeBetMenu(betType).reply_markup,
    }
  ).catch(() =>
    ctx.reply(`🎡 Выбери ставку:`, {
      parse_mode: "HTML",
      reply_markup: rouletteSizeBetMenu(betType).reply_markup,
    })
  );
}

export async function askRouletteNumber(ctx: Context, bet: number) {
  await ctx.reply(
    `🔢 <b>Введи число от 0 до 36:</b>\n\nСтавка: ${formatBalance(bet)} 🪙`,
    { parse_mode: "HTML" }
  );
}

export async function playRoulette(
  ctx: Context,
  betType: string,
  bet: number,
  chosenNumber?: number
) {
  const userId = ctx.from!.id;
  const user = await getUserById(userId);

  if (!user || user.banned) return ctx.reply("❌ Аккаунт не найден.");
  if (user.balance < bet) {
    return ctx.reply(`❌ Недостаточно средств!\n💵 ${formatBalance(user.balance)} 🪙`);
  }
  if (bet < config.MIN_BET || bet > config.MAX_BET) {
    return ctx.reply(`❌ Ставка: от ${config.MIN_BET} до ${config.MAX_BET} 🪙`);
  }

  await updateBalance(userId, -bet);

  const msg = await ctx.reply(
    `🎡 <b>РУЛЕТКА</b>\n\n🌀 Колесо вращается...`,
    { parse_mode: "HTML" }
  );

  for (const frame of ROULETTE_FRAMES) {
    await sleep(600);
    await ctx.telegram.editMessageText(
      ctx.chat!.id, msg.message_id, undefined,
      `🎡 <b>РУЛЕТКА</b>\n\n${frame}`,
      { parse_mode: "HTML" }
    );
  }

  const result = spinRoulette();
  const color = getColor(result);
  const colorEmoji = getColorEmoji(color);

  let multiplier = 0;
  let won = false;
  let betLabel = "";

  if (betType === "red") {
    won = color === "red";
    multiplier = 2;
    betLabel = "🔴 Красное";
  } else if (betType === "black") {
    won = color === "black";
    multiplier = 2;
    betLabel = "⚫ Чёрное";
  } else if (betType === "green") {
    won = color === "green";
    multiplier = 14;
    betLabel = "🟢 Зеро";
  } else if (betType === "number" && chosenNumber !== undefined) {
    won = result === chosenNumber;
    multiplier = 36;
    betLabel = `🔢 Число ${chosenNumber}`;
  }

  const winAmount = won ? bet * multiplier : 0;
  if (won) await updateBalance(userId, winAmount);

  const xpGain = calcXPGain(bet, won);
  const { leveledUp, newLevel } = await addXP(userId, xpGain);
  await recordGame(userId, "roulette", bet, won ? "win" : "loss", winAmount, {
    betType,
    chosenNumber,
    result,
    color,
    multiplier,
  });

  const updatedUser = await getUserById(userId);

  const wheelDisplay = buildWheel(result);

  await sleep(500);
  await ctx.telegram.editMessageText(
    ctx.chat!.id, msg.message_id, undefined,
    `🎡 <b>РУЛЕТКА</b>\n\n` +
    `${wheelDisplay}\n\n` +
    `Выпало: <b>${colorEmoji} ${result}</b>\n` +
    `Твоя ставка: ${betLabel}\n\n` +
    `${won ? "🎉 <b>ПОБЕДА!</b>" : "😔 <b>ПРОИГРЫШ</b>"}\n` +
    `💸 Ставка: ${formatBalance(bet)} 🪙\n` +
    (won ? `💰 Выигрыш: <b>+${formatBalance(winAmount)} 🪙</b>\n` : `💸 Потеряно: <b>-${formatBalance(bet)} 🪙</b>\n`) +
    `⭐ XP: +${xpGain}\n` +
    `💵 Баланс: ${formatBalance(updatedUser?.balance || 0)} 🪙` +
    (leveledUp ? `\n\n🆙 <b>УРОВЕНЬ ${newLevel}!</b> 🎊` : ""),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🔄 Ещё (${betLabel})`, callback_data: `rou_bet_${betType}_${bet}` },
            { text: "🎮 Меню игр", callback_data: "back_games" },
          ],
          [{ text: "🎡 Выбрать ставку", callback_data: "game_roulette" }],
        ],
      },
    }
  );
}

function buildWheel(result: number): string {
  const display = [];
  for (let i = result - 2; i <= result + 2; i++) {
    const n = ((i % 37) + 37) % 37;
    const c = getColor(n);
    const em = c === "green" ? "🟢" : c === "red" ? "🔴" : "⚫";
    if (n === result) {
      display.push(`[${em}${n}]`);
    } else {
      display.push(`${em}${n}`);
    }
  }
  return display.join(" ");
}
