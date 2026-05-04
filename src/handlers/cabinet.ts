import { Context } from "telegraf";
import { getUserById, getUserHistory, getUserTransactions } from "../db/queries";
import { cabinetMessage } from "../utils/formatting";
import { formatBalance } from "../utils/levels";

export async function handleCabinet(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("❌ Сначала напиши /start");

  const text = cabinetMessage(user);

  const sendOpts = {
    parse_mode: "HTML" as const,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📊 История игр", callback_data: "history_games" },
          { text: "💳 Транзакции", callback_data: "history_tx" },
        ],
        [
          { text: "💰 Пополнить", callback_data: "open_deposit" },
          { text: "💸 Вывести", callback_data: "open_withdraw" },
        ],
      ],
    },
  };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(text, sendOpts).catch(() => ctx.reply(text, sendOpts));
  } else {
    await ctx.reply(text, sendOpts);
  }
}

export async function handleHistory(ctx: Context) {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const history = await getUserHistory(userId, 15);

  if (history.length === 0) {
    return ctx.reply("📊 История пуста — сыграй первую игру!", {
      reply_markup: { inline_keyboard: [[{ text: "🎮 Играть", callback_data: "back_games" }]] },
    });
  }

  const gameEmojis: Record<string, string> = {
    dice_solo: "🎲", dice_multi: "🎲👥",
    slots: "🎰", coinflip: "🪙", coinflip_multi: "🪙👥", roulette: "🎡",
  };

  let text = `📊 <b>История игр</b> (${history.length})\n━━━━━━━━━━━━━━━\n`;
  for (const g of history) {
    const emoji = gameEmojis[g.game_type] || "🎮";
    const res = g.result === "win" ? "✅" : g.result === "draw" ? "🤝" : "❌";
    const date = new Date(g.created_at).toLocaleDateString("ru-RU");
    text += `${emoji} ${res}  <b>${formatBalance(g.bet)} 🪙</b>`;
    if (g.result === "win") text += `  →  <b>+${formatBalance(g.win_amount)} 🪙</b>`;
    else if (g.result === "draw") text += `  🤝`;
    text += `  <i>${date}</i>\n`;
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Кабинет", callback_data: "back_cabinet" }]] },
  });
}

export async function handleTransactionHistory(ctx: Context) {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const txs = await getUserTransactions(userId, 15);

  if (txs.length === 0) {
    return ctx.reply("💳 Транзакций пока нет.", {
      reply_markup: { inline_keyboard: [[{ text: "💰 Пополнить", callback_data: "open_deposit" }]] },
    });
  }

  const typeLabels: Record<string, string> = {
    deposit: "💰 Депозит",
    withdrawal: "💸 Вывод",
    referral_bonus: "👥 Реф. бонус",
  };
  const statusEmoji: Record<string, string> = {
    pending: "⏳", completed: "✅", failed: "❌",
  };

  let text = `💳 <b>История транзакций</b> (${txs.length})\n━━━━━━━━━━━━━━━\n`;
  for (const tx of txs) {
    const label = typeLabels[tx.type] || tx.type;
    const statusE = statusEmoji[tx.status] || "❓";
    const date = new Date(tx.created_at).toLocaleDateString("ru-RU");
    text += `${statusE} ${label}  <b>${tx.amount > 0 ? "+" : ""}${formatBalance(tx.amount)} 🪙</b>`;
    if (tx.currency) text += `  (${tx.currency})`;
    text += `  <i>${date}</i>\n`;
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Кабинет", callback_data: "back_cabinet" }]] },
  });
}
