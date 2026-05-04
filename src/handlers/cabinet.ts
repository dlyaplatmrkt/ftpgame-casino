import { Context } from "telegraf";
import { getUserById, getUserHistory, getUserTransactions } from "../db/queries";
import { mainMenu } from "../utils/keyboards";
import { cabinetMessage, escapeMarkdown } from "../utils/formatting";
import { formatBalance } from "../utils/levels";

export async function handleCabinet(ctx: Context) {
  const user = await getUserById(ctx.from!.id);
  if (!user) return ctx.reply("❌ Сначала напиши /start");

  const text = cabinetMessage(user);

  await ctx.reply(text, {
    parse_mode: "HTML",
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
  });
}

export async function handleHistory(ctx: Context) {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const history = await getUserHistory(userId, 15);

  if (history.length === 0) {
    return ctx.reply("📊 История игр пуста. Сыграй первую игру!", {
      reply_markup: {
        inline_keyboard: [[{ text: "🎮 Играть", callback_data: "back_games" }]],
      },
    });
  }

  const gameEmojis: Record<string, string> = {
    dice_solo: "🎲",
    dice_multi: "🎲👥",
    slots: "🎰",
    coinflip: "🪙",
    coinflip_multi: "🪙👥",
    roulette: "🎡",
  };

  let text = `📊 <b>ИСТОРИЯ ИГР (последние ${history.length})</b>\n\n`;

  for (const g of history) {
    const emoji = gameEmojis[g.game_type] || "🎮";
    const resultEmoji = g.result === "win" ? "✅" : g.result === "draw" ? "🤝" : "❌";
    const date = new Date(g.created_at).toLocaleDateString("ru-RU");

    text +=
      `${emoji} ${resultEmoji} ${date}\n` +
      `Ставка: ${formatBalance(g.bet)} 🪙`;

    if (g.result === "win") {
      text += ` → +${formatBalance(g.win_amount)} 🪙\n`;
    } else if (g.result === "draw") {
      text += ` → 🤝 Возврат\n`;
    } else {
      text += ` → -${formatBalance(g.bet)} 🪙\n`;
    }
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Кабинет", callback_data: "back_cabinet" }],
      ],
    },
  });
}

export async function handleTransactionHistory(ctx: Context) {
  await ctx.answerCbQuery();
  const userId = ctx.from!.id;
  const txs = await getUserTransactions(userId, 15);

  if (txs.length === 0) {
    return ctx.reply("💳 История транзакций пуста.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Пополнить", callback_data: "open_deposit" }],
        ],
      },
    });
  }

  const typeLabels: Record<string, string> = {
    deposit: "💰 Пополнение",
    withdrawal: "💸 Вывод",
    referral_bonus: "👥 Реф. бонус",
    win: "🏆 Выигрыш",
    loss: "💸 Проигрыш",
  };

  const statusEmoji: Record<string, string> = {
    pending: "⏳",
    completed: "✅",
    failed: "❌",
    paid: "✅",
  };

  let text = `💳 <b>ИСТОРИЯ ТРАНЗАКЦИЙ</b>\n\n`;

  for (const tx of txs) {
    const label = typeLabels[tx.type] || tx.type;
    const emoji = statusEmoji[tx.status] || "❓";
    const date = new Date(tx.created_at).toLocaleDateString("ru-RU");

    text += `${emoji} ${label}\n`;
    text += `💵 ${tx.amount > 0 ? "+" : ""}${formatBalance(tx.amount)} 🪙`;
    if (tx.currency) text += ` (${tx.currency})`;
    text += ` — ${date}\n\n`;
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Кабинет", callback_data: "back_cabinet" }],
      ],
    },
  });
}
